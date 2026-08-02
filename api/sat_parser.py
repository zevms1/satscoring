"""
SAT MyPractice report parser for EdisonOS.

Combines three sources per student:
  1. Saved "Details" HTML page (MyPractice > per-test results page, saved via
     browser "Save Page As -> Webpage, Complete")
  2. Official PDF Score Report (downloaded from MyPractice)
  3. A master item-bank Google Sheet (QuestionKey, EQB_ID, FormCode, Section,
     Module, QuestionNumber, Correct, Difficulty, Domain, Skill) that is
     looked up automatically to fill in Difficulty/Skill for every question,
     since MyPractice's own per-question tooltips only render for whichever
     rows happened to be on-screen when the page was saved.

Usage:
    python3 sat_parser.py <details.html> <score_report.pdf> --out report.json
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
import urllib.parse
from datetime import datetime

import pdfplumber

ITEM_BANK_SHEET_ID = "1aGadmWgpDhqBjZi-ypMRt6iNgF-vfbqpdjWmIWo_PFI"
ITEM_BANK_GID = "0"

DOMAIN_NAMES = {
    "CAS": "Craft and Structure",
    "IAI": "Information and Ideas",
    "SEC": "Standard English Conventions",
    "EOI": "Expression of Ideas",
    "ALG": "Algebra",
    "ADV": "Advanced Math",
    "PSD": "Problem-Solving and Data Analysis",
    "GTR": "Geometry and Trigonometry",
}

# Numeric domain codes, from Michael's SkillNames&Codes.xlsx ("Dom #" column).
# Reading & Writing and Math each number their own domains 01-04.
DOMAIN_NUM_CODES = {
    "CAS": "01", "IAI": "02", "SEC": "03", "EOI": "04",
    "ALG": "01", "ADV": "02", "PSD": "03", "GTR": "04",
}

# Numeric skill codes ("Skill code" column): domain#.skill#, skill# counting
# sequentially across all of that section's domains (not reset per domain).
SKILL_NUM_CODES = {
    # Reading & Writing
    "WIC": "01.01", "TSP": "01.02", "CTC": "01.03",
    "CID": "02.04", "COE": "02.05", "INF": "02.06",
    "BND": "03.07", "FSS": "03.08",
    "TRN": "04.09", "RSY": "04.10",
    # Math
    "LOV": "01.01", "LNF": "01.02", "LTV": "01.03", "SLE": "01.04", "LIQ": "01.05",
    "NLF": "02.06", "NES": "02.07", "EQE": "02.08",
    "RRP": "03.09", "PCT": "03.10", "CSD": "03.11", "MSC": "03.12",
    "PRB": "03.13", "IME": "03.14", "ESE": "03.15",
    "AVL": "04.16", "LAT": "04.17", "RTT": "04.18", "CRC": "04.19",
}

# Skill-code -> full name, from Michael's SkillNames&Codes.xlsx (authoritative).
SKILL_NAMES = {
    # Reading & Writing
    "WIC": "Words in Context",
    "TSP": "Text Structure & Purpose",
    "CTC": "Cross-Text Connections",
    "CID": "Central Ideas & Details",
    "COE": "Command of Evidence",
    "INF": "Inferences",
    "BND": "Boundaries",
    "FSS": "Form, Structure, & Sense",
    "TRN": "Transitions",
    "RSY": "Rhetorical Synthesis",
    # Math
    "LOV": "Linear equations in one variable",
    "LNF": "Linear functions",
    "LTV": "Linear equations in two variables",
    "SLE": "Systems of two linear equations in two variables",
    "LIQ": "Linear inequalities in one or two variables",
    "NLF": "Nonlinear functions",
    "NES": "Nonlinear equations in one variable and systems of equations in two variables",
    "EQE": "Equivalent expressions",
    "RRP": "Ratios, rates, proportional relationships, and units",
    "PCT": "Percentages",
    "CSD": "One-variable data: Distributions and measures of center and spread",
    "MSC": "Two-variable data: Models and scatterplots",
    "PRB": "Probability and conditional probability",
    "IME": "Inference from sample statistics and margin of error",
    "ESE": "Evaluating statistical claims: Observational studies and experiments",
    "AVL": "Area and volume",
    "LAT": "Lines, angles, and triangles",
    "RTT": "Right triangles and trigonometry",
    "CRC": "Circles",
}

DIFFICULTY_NAMES = {"1": "Easy", "2": "Medium", "3": "Hard"}


def _gviz_csv(query):
    url = (
        f"https://docs.google.com/spreadsheets/d/{ITEM_BANK_SHEET_ID}/gviz/tq"
        f"?tqx=out:csv&gid={ITEM_BANK_GID}&tq={urllib.parse.quote(query)}"
    )
    with urllib.request.urlopen(url, timeout=30) as resp:
        text = resp.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def fetch_module1_bank():
    """All FormCodes' Module-1 rows (fixed/non-adaptive, used to identify FormCode)."""
    rows = _gviz_csv("select A,C,D,E,F,G where E = 1")
    return rows


def fetch_full_bank(form_code):
    rows = _gviz_csv(f"select * where C = '{form_code}'")
    return rows


def parse_details_html(path):
    """Parse the saved MyPractice Details HTML into one row per question."""
    with open(path, encoding="utf-8", errors="ignore") as f:
        content = f.read()

    trs = re.findall(r'<tr data-tr="\d+".*?</tr>', content, re.S)
    rows = []
    for tr in trs:
        qnum = re.search(r'scope="row">(\d+)</th>', tr)
        section = re.search(r'id="section-question-\d+">([^<]+)</td>', tr)
        correct_ans = re.search(r'<td class=""><div>([^<]*)</div></td>', tr)
        # Correct answers use class="correct". Both incorrect AND omitted
        # answers use class="cb-red1-color" (there is no separate "incorrect"
        # class) — they're only distinguished by the text: "{letter}; Incorrect"
        # vs. plain "Omitted". Must check text content, not just class.
        status = re.search(r'class="(correct|incorrect|cb-red1-color)">([^<]*)</p>', tr)
        domain = re.search(r'id="domain-question-\d+">([^<]+)</td>', tr)
        modbtn = re.search(r'id="module-(\d+)-question-(\d+)-button"', tr)

        if not (qnum and section and correct_ans and modbtn):
            continue

        status_class = status.group(1) if status else None
        status_text = status.group(2) if status else None
        if status_class == "correct":
            outcome = "correct"
        elif status_text == "Omitted":
            outcome = "omitted"
        elif status_text and "Incorrect" in status_text:
            outcome = "incorrect"
        else:
            outcome = "unknown"

        # The "your answer" cell reads "{letter}; Correct" or "{letter}; Incorrect"
        # when the student answered, and just "Omitted" when they left it blank.
        student_answer = None
        if status_text and ";" in status_text:
            student_answer = status_text.split(";")[0].strip()

        sec_text = section.group(1)
        sec_code = "RW" if "Reading" in sec_text else "MA"

        rows.append({
            "question_overall": int(qnum.group(1)),
            "section": sec_code,
            "section_label": sec_text,
            "module_html": modbtn.group(1),          # '1' or '2' as shown to student
            "qnum_in_module": modbtn.group(2),
            "correct_answer_key": correct_ans.group(1).strip(),
            "student_answer": student_answer,
            "outcome": outcome,
            "domain_label": domain.group(1) if domain else None,
        })
    return rows


def parse_test_meta(html_path):
    """Pull the test name + date straight off the saved MyPractice page --
    no manual entry needed. The browser titles/names the saved file after
    the page's own <title>, which MyPractice renders as e.g.:
        "MyPractice - SAT Practice 7 - August 7, 2025 - Details"
    Falls back to (None, None) if the title doesn't match this shape, so
    callers can fall back to a placeholder rather than fail the upload.
    """
    with open(html_path, encoding="utf-8", errors="ignore") as f:
        # The <title> tag is always in the first few KB of the document.
        head = f.read(8192)

    m = re.search(
        r"<title>\s*MyPractice\s*-\s*(.+?)\s*-\s*(\w+ \d{1,2},\s*\d{4})\s*-\s*Details\s*</title>",
        head,
        re.I,
    )
    if not m:
        return None, None

    test_name = m.group(1).strip()
    try:
        test_date = datetime.strptime(m.group(2).strip(), "%B %d, %Y").date().isoformat()
    except ValueError:
        test_date = None
    return test_name, test_date


def parse_score_pdf(path):
    """Parse the official MyPractice PDF score report.

    The PDF's text layout (as extracted by pdfplumber) reads, line by line:
        1050 Reading and Writing Questions Overview      <- total scaled score
        510 48                                            <- rw scaled, total correct
        Score Range: Correct Total Questions: 98
        200-800 Answers Total Incorrect: 50               <- total incorrect
        ...
        Score Range: 27 Correct 21 Correct                <- rw correct, math correct
        This range reflects the 540                       <- math scaled score
        ...
        Total Questions: 54 Total Questions: 44            <- rw total, math total
        ...
        Incorrect Answers: 27 Incorrect Answers: 23        <- rw incorrect, math incorrect
    Note "Incorrect" on this PDF bundles omitted questions in with wrong answers.
    """
    with pdfplumber.open(path) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    def find(pattern, cast=int):
        m = re.search(pattern, text)
        return cast(m.group(1)) if m else None

    result = {
        "total_scaled": find(r"(\d{3,4}) Reading and Writing Questions Overview"),
        "total_questions": find(r"Correct Total Questions:\s*(\d+)"),
        "total_incorrect": find(r"Answers Total Incorrect:\s*(\d+)"),
        "math_scaled": find(r"This range reflects the (\d+)"),
        "rw_scaled": None,
        "total_correct": None,
        "rw_correct": None,
        "math_correct": None,
        "rw_total": None,
        "math_total": None,
        "rw_incorrect": None,
        "math_incorrect": None,
    }

    m = re.search(r"\n(\d{3}) (\d+)\nScore Range: Correct Total Questions:", text)
    if m:
        result["rw_scaled"] = int(m.group(1))
        result["total_correct"] = int(m.group(2))

    m = re.search(r"Score Range: (\d+) Correct (\d+) Correct", text)
    if m:
        result["rw_correct"] = int(m.group(1))
        result["math_correct"] = int(m.group(2))

    m = re.search(r"Total Questions:\s*(\d+) Total Questions:\s*(\d+)", text)
    if m:
        result["rw_total"] = int(m.group(1))
        result["math_total"] = int(m.group(2))

    m = re.search(r"Incorrect Answers:\s*(\d+) Incorrect Answers:\s*(\d+)", text)
    if m:
        result["rw_incorrect"] = int(m.group(1))
        result["math_incorrect"] = int(m.group(2))

    result["raw_text"] = text
    return result


def identify_form_code(html_rows, module1_bank_rows):
    """Match the HTML's Module-1 correct-answer key against every FormCode's
    Module-1 key (fixed/non-adaptive) to find which form this test is."""
    by_form = {}
    for r in module1_bank_rows:
        by_form.setdefault(r["FormCode"], {})[(r["Section"], r["QuestionNumber"])] = r["Correct"]

    m1_rows = [r for r in html_rows if r["module_html"] == "1"]
    scores = {}
    for form_code, bank in by_form.items():
        match = 0
        for r in m1_rows:
            key = (r["section"], r["qnum_in_module"])
            if bank.get(key) == r["correct_answer_key"]:
                match += 1
        scores[form_code] = match

    best_form = max(scores, key=scores.get)
    return best_form, scores[best_form], len(m1_rows), scores


def determine_second_module_mapping(html_rows, full_bank_rows):
    """Digital SAT's 2nd module is adaptive (easier/harder). The item bank
    stores both variants under Module=2 and Module=3. Figure out which one
    this student actually received by matching correct-answer keys."""
    bank_idx = {}
    for r in full_bank_rows:
        bank_idx.setdefault((r["Section"], r["Module"]), {})[r["QuestionNumber"]] = r

    m2_rows = [r for r in html_rows if r["module_html"] == "2"]
    mapping = {}  # section -> bank module id student actually got ('2' or '3')
    for section in ("RW", "MA"):
        sec_rows = [r for r in m2_rows if r["section"] == section]
        best_mod, best_score = None, -1
        for candidate in ("2", "3"):
            bank = bank_idx.get((section, candidate), {})
            score = sum(1 for r in sec_rows if bank.get(r["qnum_in_module"], {}).get("Correct") == r["correct_answer_key"])
            if score > best_score:
                best_mod, best_score = candidate, score
        mapping[section] = (best_mod, best_score, len(sec_rows))
    return mapping


def build_merged_dataset(html_rows, full_bank_rows, module2_mapping):
    bank_idx = {}
    for r in full_bank_rows:
        bank_idx[(r["Section"], r["Module"], r["QuestionNumber"])] = r

    merged = []
    for r in html_rows:
        bank_module = r["module_html"] if r["module_html"] == "1" else module2_mapping[r["section"]][0]
        bank_row = bank_idx.get((r["section"], bank_module, r["qnum_in_module"]))

        difficulty_code = bank_row["Difficulty"] if bank_row else None
        skill_code = bank_row["Skill"] if bank_row else None
        domain_code = bank_row["Domain"] if bank_row else None

        merged.append({
            **r,
            "domain_code": domain_code,
            "domain_name": DOMAIN_NAMES.get(domain_code, r["domain_label"]),
            "skill_code": skill_code,
            "skill_name": SKILL_NAMES.get(skill_code, skill_code),
            "difficulty_code": difficulty_code,
            "difficulty_name": DIFFICULTY_NAMES.get(difficulty_code),
            "bank_correct_key": bank_row["Correct"] if bank_row else None,
            "question_id": bank_row["EQB_ID"] if bank_row else None,
        })
    return merged


def summarize(merged, pdf_scores):
    def bucket(rows):
        c = sum(1 for r in rows if r["outcome"] == "correct")
        i = sum(1 for r in rows if r["outcome"] == "incorrect")
        o = sum(1 for r in rows if r["outcome"] == "omitted")
        return {"correct": c, "incorrect": i, "omitted": o, "total": len(rows)}

    def bucket_with_pct(rows):
        b = bucket(rows)
        attempted = b["correct"] + b["incorrect"]
        b["accuracy_pct"] = round(100 * b["correct"] / attempted) if attempted else None
        return b

    def by_difficulty(rows):
        out = {}
        for level, name in DIFFICULTY_NAMES.items():
            sub_rows = [r for r in rows if r["difficulty_code"] == level]
            if not sub_rows:
                continue
            out[name] = bucket_with_pct(sub_rows)
        return out

    summary = {
        "raw_scores": {
            "total": bucket(merged),
            "math": bucket([r for r in merged if r["section"] == "MA"]),
            "reading_and_writing": bucket([r for r in merged if r["section"] == "RW"]),
        },
        "scaled_scores": {
            "total": pdf_scores.get("total_scaled"),
            "math": pdf_scores.get("math_scaled"),
            "reading_and_writing": pdf_scores.get("rw_scaled"),
        },
        "difficulty_breakdown": {},
        "domain_level_analysis": {},
        "skill_level_analysis": {},
    }

    for section in ("RW", "MA"):
        sec_rows = [r for r in merged if r["section"] == section]
        diff = {}
        for level, name in DIFFICULTY_NAMES.items():
            rows = [r for r in sec_rows if r["difficulty_code"] == level]
            if not rows:
                continue
            diff[name] = bucket_with_pct(rows)
        summary["difficulty_breakdown"][section] = diff

    for section in ("RW", "MA"):
        sec_rows = [r for r in merged if r["section"] == section]

        domains = {}
        for domain_code, domain_name in DOMAIN_NAMES.items():
            rows = [r for r in sec_rows if r["domain_code"] == domain_code]
            if not rows:
                continue
            b = bucket_with_pct(rows)
            b["code"] = domain_code
            b["num_code"] = DOMAIN_NUM_CODES.get(domain_code)
            b["name"] = domain_name
            b["by_difficulty"] = by_difficulty(rows)
            domains[domain_code] = b
        summary["domain_level_analysis"][section] = domains

        skill_codes = sorted(set(r["skill_code"] for r in sec_rows if r["skill_code"]))
        skills = {}
        for skill_code in skill_codes:
            rows = [r for r in sec_rows if r["skill_code"] == skill_code]
            b = bucket_with_pct(rows)
            b["code"] = skill_code
            b["num_code"] = SKILL_NUM_CODES.get(skill_code)
            b["name"] = SKILL_NAMES.get(skill_code, skill_code)
            b["domain_code"] = rows[0]["domain_code"]
            b["by_difficulty"] = by_difficulty(rows)
            skills[skill_code] = b
        summary["skill_level_analysis"][section] = skills

    return summary


def build_report(html_path, pdf_path):
    html_rows = parse_details_html(html_path)
    pdf_scores = parse_score_pdf(pdf_path)
    test_name, test_date = parse_test_meta(html_path)

    module1_bank = fetch_module1_bank()
    form_code, match_score, m1_total, all_scores = identify_form_code(html_rows, module1_bank)

    full_bank = fetch_full_bank(form_code)
    module2_mapping = determine_second_module_mapping(html_rows, full_bank)

    merged = build_merged_dataset(html_rows, full_bank, module2_mapping)
    summary = summarize(merged, pdf_scores)

    diagnostics = {
        "form_code": form_code,
        "form_code_match": f"{match_score}/{m1_total}",
        "form_code_candidates": all_scores,
        "module2_routing": {
            sec: {"bank_module": mod, "match": f"{score}/{total}"}
            for sec, (mod, score, total) in module2_mapping.items()
        },
    }

    return {
        "summary": summary,
        "questions": merged,
        "diagnostics": diagnostics,
        "test_name": test_name,
        "test_date": test_date,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("pdf")
    ap.add_argument("--out", default="report.json")
    args = ap.parse_args()

    report = build_report(args.html, args.pdf)
    with open(args.out, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Wrote {args.out}")
    print(json.dumps(report["diagnostics"], indent=2))
    print(json.dumps(report["summary"]["raw_scores"], indent=2))


if __name__ == "__main__":
    main()
