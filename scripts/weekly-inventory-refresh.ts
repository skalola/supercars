import { spawn } from "node:child_process";

type Step = {
  label: string;
  command: string;
  args: string[];
};

const steps: Step[] = [
  {
    label: "Crawl public supported supercar inventory",
    command: "npm",
    args: ["run", "crawl-inventory"],
  },
  {
    label: "Resolve inventory dealers into directory",
    command: "npm",
    args: ["run", "sync-inventory-dealer-directory"],
  },
  {
    label: "Crawl discovered dealer-owned inventory sites",
    command: "npm",
    args: ["run", "crawl-directory-dealer-inventory"],
  },
  {
    label: "Remove stale/dead live listing links",
    command: "npm",
    args: ["run", "verify-live-listings", "--", "--execute", "--limit=500"],
  },
  {
    label: "Apply inventory and directory trust policy",
    command: "npm",
    args: ["run", "apply-inventory-directory-policy"],
  },
];

async function runStep(step: Step) {
  console.log(`\n==================================================`);
  console.log(`  ${step.label}`);
  console.log(`==================================================`);
  console.log(`$ ${step.command} ${step.args.join(" ")}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${step.label} failed with exit code ${code}`));
    });
  });
}

async function main() {
  for (const step of steps) {
    await runStep(step);
  }

  console.log("\nWeekly inventory refresh completed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
