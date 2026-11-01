import pc from "picocolors";
import { execa } from "execa";
import { readState } from "../state.js";

export async function runAider(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.log(pc.red("No LocalStack state found — run `localstack init` first."));
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
        "\nCouldn't launch aider. Install it with `pip install aider-chat`, then re-run `localstack aider`."
      )
    );
    process.exitCode = 1;
  }
}
