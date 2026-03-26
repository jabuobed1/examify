export const LandingSection = ({ title, eyebrow, description, children }) => (
  <section className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
    <div className="max-w-3xl">
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-600">{eyebrow}</p> : null}
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{title}</h2>
      {description ? <p className="mt-4 text-lg leading-8 text-slate-600">{description}</p> : null}
    </div>
    <div className="mt-10">{children}</div>
  </section>
);
