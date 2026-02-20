export default function StatusBadge({ status, variant }) {
  const normalized = status || "unknown";
  const label =
    variant === "payment"
      ? normalized
      : normalized === "active"
        ? "Active"
        : normalized === "suspended"
          ? "Suspended"
          : normalized;
  const classes = ["status-badge"];
  classes.push(`${variant}-${normalized}`);

  return <span className={classes.join(" ")}>{label}</span>;
}
