import { Font } from "@react-pdf/renderer";

// Noto Sans covers Latin (with accents), Greek, Cyrillic, punctuation and currency
export const FONT_FAMILY = "Noto Sans";

// react-pdf downloads these from Google Fonts on first use. The URLs are versioned (v42), so they
// always serve the same files. From https://fonts.googleapis.com/css2?family=Noto+Sans
function registerFonts() {
  // Drop any previous registration first; react-pdf's built-in fonts are left untouched
  delete Font.getRegisteredFonts()[FONT_FAMILY];
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf",
      },
      {
        src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAaBN9d.ttf",
        fontWeight: "bold",
      },
      {
        src: "https://fonts.gstatic.com/s/notosans/v42/o-0kIpQlx3QUlC5A4PNr4C5OaxRsfNNlKbCePevHtVtX57DGjDU1QDce6Vc.ttf",
        fontStyle: "italic",
      },
      {
        src: "https://fonts.gstatic.com/s/notosans/v42/o-0kIpQlx3QUlC5A4PNr4C5OaxRsfNNlKbCePevHtVtX57DGjDU1QNAZ6Vc.ttf",
        fontWeight: "bold",
        fontStyle: "italic",
      },
    ],
  });
}

registerFonts();

// react-pdf keeps a font's load result, including a failed download, for the life of its
// registration, so one failed download would break every later PDF until restart. Registering the
// family again after a failed render gives the next render a fresh download attempt.
export async function renderWithFontRetry(render: () => Promise<Buffer>): Promise<Buffer> {
  try {
    return await render();
  } catch (error) {
    registerFonts();
    throw error;
  }
}

// ATS parsers match whole keywords — never let the layout engine split "Kubernetes" into "Kuber-netes"
Font.registerHyphenationCallback((word) => [word]);
