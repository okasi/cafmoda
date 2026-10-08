// sudo -ll identifies authentication separately for each sudoers entry.
// A successful sudo -l alone only proves permission, not passwordless access.
export function hasPasswordlessPmset(
  listing: string,
  settings: string[][],
): boolean {
  const commands = listing.split("Sudoers entry:").slice(1).flatMap((entry) => {
    const users = entry.match(/^\s*RunAsUsers:\s*(.+)$/m)?.[1].split(/,\s*/);
    const options = entry.match(/^\s*Options:\s*(.+)$/m)?.[1].split(/,\s*/);
    if (
      !users?.some((user) => user === "ALL" || user === "root") ||
      !options?.includes("!authenticate")
    ) return [];
    return (entry.split("Commands:")[1] ?? "").trim().split("\n")
      .map((line) => line.trim());
  });
  return settings.every((args) =>
    commands.includes("ALL") ||
    commands.includes(`/usr/bin/pmset ${args.join(" ")}`) ||
    commands.includes(`/usr/bin/pmset ${args.slice(0, -1).join(" ")} *`)
  );
}
