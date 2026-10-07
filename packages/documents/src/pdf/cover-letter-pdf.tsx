/** @jsxRuntime automatic */
/** @jsxImportSource react */
// tsx applies a tsconfig's jsx setting only to files it includes, so consumers (e.g. the worker) need this pragma
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { format } from "date-fns";
import { renderWithFontRetry } from "./fonts";
import { PDF_CREATOR, pdfStyles } from "./styles";

export function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export async function renderCoverLetterPdf({
  body,
  applicantName,
  date,
}: {
  body: string;
  applicantName: string;
  date: Date;
}): Promise<Buffer> {
  const title = applicantName ? `${applicantName} - Cover Letter` : "Cover Letter";
  return renderWithFontRetry(() =>
    renderToBuffer(
      <Document title={title} author={applicantName} creator={PDF_CREATOR} producer={PDF_CREATOR}>
        <Page size="LETTER" style={[pdfStyles.page, pdfStyles.coverLetterPage]}>
          <Text style={pdfStyles.coverLetterDate}>{format(date, "MMMM d, yyyy")}</Text>
          {splitParagraphs(body).map((paragraph, index) => (
            <Text key={`${index}-${paragraph.slice(0, 20)}`} style={pdfStyles.coverLetterParagraph}>
              {paragraph}
            </Text>
          ))}
        </Page>
      </Document>
    )
  );
}
