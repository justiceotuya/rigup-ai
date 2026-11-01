import pc from "picocolors";
import { execa } from "execa";
import { readState } from "../state.js";

export async function runAider(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.log(pc.red("No RigUp AI state found — run `rigup init` first."));
    process.exitCode = 1;
    return;
  }

  const modelArg = `ollama/${state.models.chatAgent}`;
  console.log(pc.gray(`Launching aider --model ${modelArg} ...`));

  try {
    await execa("aider", ["--model", modelArg], { stdio: "inherit" });
  } catch (err: unknown) {
    console.log(
      pc.red(
        "\nCouldn't launch aider. Install it with `pip install aider-chat`, then re-run `rigup aider`."
      )
    );
    process.exitCode = 1;
  }
}
