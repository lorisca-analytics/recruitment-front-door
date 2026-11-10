// Candidate card on the Card tab, and its one-page PDF export.
// The layout is drawn by code, so every card looks the same and nobody has to
// maintain lookup formulas on the tab.

import { CandidateCard, CardField } from '../core';
import { TAB, configValue, tab, ss } from './sheet';

const RANGE = 'A1:H38';

export function renderCardTab(card: CandidateCard) {
  const sh = tab(TAB.card);
  sh.getRange(RANGE).breakApart().clear();
  sh.setColumnWidth(1, 16).setColumnWidths(2, 6, 120).setColumnWidth(8, 16);

  const head = (a1: string, text: string) =>
    sh.getRange(a1).setValue(text).setFontWeight('bold').setFontSize(9).setFontColor('#4a5a70');

  sh.getRange('B2:E2').merge().setValue(card.name).setFontSize(18).setFontWeight('bold');
  sh.getRange('F2:G2').merge().setValue(card.regId).setHorizontalAlignment('right').setFontSize(12);
  sh.getRange('B3:E3').merge().setValue(card.headline).setFontColor('#4a5a70');
  sh.getRange('F3:G3').merge().setValue(card.status).setHorizontalAlignment('right').setFontSize(9);

  head('B5', 'BASICS');
  writeFields(sh, 6, 2, card.basics);
  head('E5', 'WORK');
  writeFields(sh, 6, 5, card.work);

  head('B13', 'EDUCATION');
  writeFields(sh, 14, 2, card.education);
  head('E13', 'PROBE POINTS FOR THIS CANDIDATE');
  sh.getRange('E14:G19').merge().setValue(card.probes.map((p) => `• ${p}`).join('\n')).setWrap(true).setVerticalAlignment('top');

  head('B21', 'DECISION TRAIL');
  card.trail.slice(0, 6).forEach((t, i) => {
    sh.getRange(22 + i, 2).setValue(t.step).setFontColor('#4a5a70').setFontSize(9);
    sh.getRange(22 + i, 3, 1, 5).merge().setValue(t.detail).setWrap(true).setFontSize(9);
  });

  head('B28', 'INTERVIEW NOTES');
  sh.getRange('B29:G35').merge().setValue(card.notes).setWrap(true).setVerticalAlignment('top')
    .setBorder(true, true, true, true, false, false, '#b8c2d0', SpreadsheetApp.BorderStyle.SOLID);

  sh.getRange('B37:G37').merge()
    .setValue('Result:  OK  /  NOT OK  /  REFER        Final track: ______________        Interviewer: ______________')
    .setFontSize(9);
  sh.getRange(RANGE).setFontFamily('Arial');
}

function writeFields(sh: GoogleAppsScript.Spreadsheet.Sheet, row: number, col: number, fields: CardField[]) {
  fields.forEach((f, i) => {
    sh.getRange(row + i, col).setValue(f.label).setFontColor('#4a5a70').setFontSize(9);
    const cell = sh.getRange(row + i, col + 1, 1, 2).merge();
    if (f.href) {
      cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(f.value).setLinkUrl(f.href).build());
    } else {
      cell.setValue(f.value);
    }
    cell.setWrap(true);
  });
}

/**
 * Exports the Card tab as a one-page A4 PDF with working links and saves it to
 * the cards folder. The folder keeps its own sharing settings. Share it with the
 * hiring team only. Nothing here makes a file public.
 */
export function exportCardPdf(card: CandidateCard): GoogleAppsScript.Drive.File {
  renderCardTab(card);
  SpreadsheetApp.flush();
  const book = ss();
  const sheet = tab(TAB.card);
  const params = {
    format: 'pdf',
    size: 'A4',
    portrait: 'true',
    fitw: 'true',
    scale: '4', // fit to one page
    gridlines: 'false',
    sheetnames: 'false',
    printtitle: 'false',
    pagenumbers: 'false',
    top_margin: '0.4',
    bottom_margin: '0.4',
    left_margin: '0.4',
    right_margin: '0.4',
    gid: String(sheet.getSheetId()),
    range: RANGE,
  };
  const query = Object.keys(params).map((k) => `${k}=${encodeURIComponent((params as Record<string, string>)[k])}`).join('&');
  const url = `https://docs.google.com/spreadsheets/d/${book.getId()}/export?${query}`;
  const get = () =>
    UrlFetchApp.fetch(url, { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true });
  let response = get();
  if (response.getResponseCode() === 429) {
    Utilities.sleep(10000); // rate limited. Wait once and retry.
    response = get();
  }
  if (response.getResponseCode() !== 200) {
    throw new Error(`PDF export failed with HTTP ${response.getResponseCode()}`);
  }

  const folderId = configValue('Card folder ID');
  if (!folderId) throw new Error('Set "Card folder ID" on the Config tab first');
  const folder = DriveApp.getFolderById(folderId);
  const name = `${card.regId} ${card.name}.pdf`;
  const old = folder.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true); // re-export replaces, never duplicates
  return folder.createFile(response.getBlob().setName(name));
}
