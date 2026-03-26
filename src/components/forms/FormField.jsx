export const FormField = ({ label, children, hint }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint ? <span className="mt-2 block text-xs text-slate-500">{hint}</span> : null}
  </label>
);
