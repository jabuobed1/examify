export const StatCard = ({ label, value, detail }) => (
  <div className="panel p-5">
    <p className="text-sm font-medium text-slate-500">{label}</p>
    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
    <p className="mt-2 text-sm text-slate-500">{detail}</p>
  </div>
);
