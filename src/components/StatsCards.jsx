export default function StatsCards({ metrics }) {
  const cards = [
    { label: "Active Subs", value: metrics?.activeSubs ?? 0, variant: "green" },
    { label: "Overdue", value: metrics?.overdue ?? 0, variant: "amber" },
    { label: "Radius Load", value: metrics?.radiusLoad ?? "0/0", variant: "blue" },
    { label: "Throughput", value: metrics?.throughput ?? "0%", variant: "blue" }
  ];

  return (
    <div className="stats-grid">
      {cards.map((card) => (
        <div key={card.label} className={`stats-card ${card.variant}`}>
          <p className="muted">{card.label}</p>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}
