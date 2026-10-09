/** @jsxRuntime automatic */
/** @jsxImportSource react */
// tsx applies a tsconfig's jsx setting only to files it includes, so consumers (e.g. the worker) need this pragma
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { type ResumeBlock, parseResumeMarkdown } from "../markdown";
import { renderWithFontRetry } from "./fonts";
import { InlineRuns } from "./inline-runs";
import { PDF_CREATOR, pdfStyles } from "./styles";

function ResumeBlockView({ block }: { block: ResumeBlock }) {
  switch (block.type) {
    case "name":
      return (
        <Text style={pdfStyles.name}>
          <InlineRuns runs={block.runs} />
        </Text>
      );
    case "heading":
      return (
        <Text style={pdfStyles.heading} minPresenceAhead={30}>
          <InlineRuns runs={block.runs} />
        </Text>
      );
    case "subheading":
      return (
        <Text style={pdfStyles.subheading} minPresenceAhead={20}>
          <InlineRuns runs={block.runs} />
        </Text>
      );
    case "paragraph":
      return (
        <Text style={pdfStyles.paragraph}>
          <InlineRuns runs={block.runs} />
        </Text>
      );
    case "bullets":
      return (
        <View>
          {block.items.map((runs, index) => (
            <View
              key={`${index}-${runs.map((run) => run.text).join("")}`}
              style={pdfStyles.bulletRow}
              wrap={false}
            >
              <Text style={pdfStyles.bulletMark}>•</Text>
              <Text style={pdfStyles.bulletText}>
                <InlineRuns runs={runs} />
              </Text>
            </View>
          ))}
        </View>
      );
  }
}

export async function renderResumePdf({
  markdown,
  applicantName,
}: {
  markdown: string;
  applicantName: string;
}): Promise<Buffer> {
  const blocks = parseResumeMarkdown(markdown);
  const title = applicantName ? `${applicantName} - Resume` : "Resume";
  return renderWithFontRetry(() =>
    renderToBuffer(
      <Document title={title} author={applicantName} creator={PDF_CREATOR} producer={PDF_CREATOR}>
        <Page size="LETTER" style={[pdfStyles.page, pdfStyles.resumePage]}>
          {blocks.map((block, index) => (
            <ResumeBlockView key={`${index}-${block.type}`} block={block} />
          ))}
        </Page>
      </Document>
    )
  );
}
