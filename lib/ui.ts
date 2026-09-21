// One look for every action in the app: actions are buttons, navigation
// is links. Primary is what the screen is for, secondary stands beside
// it, neutral is everything else, danger deletes; the small sizes are
// for table rows and inline editors.
const base = "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md disabled:cursor-not-allowed disabled:opacity-50";

export const BTN = {
  primary: `${base} bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark`,
  secondary: `${base} border border-brand bg-white px-4 py-2 text-sm font-bold text-brand hover:bg-brand-light/40`,
  neutral: `${base} border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50`,
  danger: `${base} border border-weak bg-white px-4 py-2 text-sm font-medium text-weak hover:bg-weak-soft`,
  small: `${base} border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50`,
  smallPrimary: `${base} bg-brand px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-dark`,
  smallSecondary: `${base} border border-brand bg-white px-2.5 py-1 text-xs font-bold text-brand hover:bg-brand-light/40`,
  smallDanger: `${base} border border-weak bg-white px-2.5 py-1 text-xs font-medium text-weak hover:bg-weak-soft`,
} as const;
