/** @jsxRuntime automatic */
/** @jsxImportSource react */
// tsx applies a tsconfig's jsx setting only to files it includes, so consumers (e.g. the worker) need this pragma
import { Link, Text } from "@react-pdf/renderer";
import type { InlineRun } from "../markdown";
import { pdfStyles } from "./styles";

function runStyle(run: InlineRun): {
  fontWeight: "bold" | "normal";
  fontStyle: "italic" | "normal";
} {
  return { fontWeight: run.bold ? "bold" : "normal", fontStyle: run.italic ? "italic" : "normal" };
}

export function InlineRuns({ runs }: { runs: InlineRun[] }) {
  return runs.map((run, index) => {
    const key = `${index}-${run.text}`;
    if (run.href) {
      return (
        <Link key={key} src={run.href} style={[pdfStyles.link, runStyle(run)]}>
          {run.text}
        </Link>
      );
    }
    if (!run.bold && !run.italic) return run.text;
    return (
      <Text key={key} style={runStyle(run)}>
        {run.text}
      </Text>
    );
  });
}
