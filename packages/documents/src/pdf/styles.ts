import { StyleSheet } from "@react-pdf/renderer";
import { FONT_FAMILY } from "./fonts";

export const PDF_CREATOR = "Applied";

const TEXT_COLOR = "#111111";

export const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    lineHeight: 1.4,
    color: TEXT_COLOR,
    paddingVertical: 43,
    paddingHorizontal: 54,
  },
  // Tighter than the cover letter so a typical one-page resume stays on one page
  resumePage: {
    lineHeight: 1.3,
    paddingVertical: 32,
    paddingHorizontal: 40,
  },
  name: {
    fontWeight: "bold",
    fontSize: 18,
    lineHeight: 1.2,
    marginBottom: 4,
  },
  heading: {
    fontWeight: "bold",
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    borderBottomWidth: 0.75,
    borderBottomColor: TEXT_COLOR,
    paddingBottom: 1,
    marginTop: 7,
    marginBottom: 4,
  },
  subheading: {
    fontWeight: "bold",
    marginTop: 4,
    marginBottom: 1,
  },
  paragraph: {
    marginBottom: 2,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 1,
  },
  bulletMark: {
    width: 12,
  },
  bulletText: {
    flex: 1,
  },
  link: {
    color: TEXT_COLOR,
    textDecoration: "none",
  },
  coverLetterPage: {
    fontSize: 11,
    lineHeight: 1.5,
  },
  coverLetterDate: {
    marginBottom: 14,
  },
  coverLetterParagraph: {
    marginBottom: 10,
  },
});
