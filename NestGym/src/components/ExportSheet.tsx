import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { FileSpreadsheet, FileText } from 'lucide-react-native';
import { C, FONT, S } from '../theme';
import { ExportCol, exportExcel, exportPdf } from '../utils/exporters';
import { Sheet, notify } from './ui';

export interface ExportSpec {
  /** file / document title, e.g. "Members" */
  name: string;
  cols: ExportCol[];
  /** fetches every row for the current filters */
  rows: () => Promise<any[]>;
}

/** Export popup: pick Excel or PDF, the data is fetched (all pages) and handed to the phone. */
export default function ExportSheet({ spec, onClose }: { spec: ExportSpec | null; onClose: () => void }) {
  const [busy, setBusy] = useState<'' | 'excel' | 'pdf'>('');
  const run = async (kind: 'excel' | 'pdf') => {
    if (!spec) return;
    setBusy(kind);
    try {
      const rows = await spec.rows();
      if (!rows.length) return notify.error('Nothing to export', 'There are no rows for the current filters.');
      await (kind === 'excel' ? exportExcel : exportPdf)(spec.name, spec.cols, rows);
      onClose();
    } catch (e: any) {
      if (e?.message && !/cancel|dismiss/i.test(e.message)) notify.error('Export failed', e.message);
    } finally {
      setBusy('');
    }
  };
  const Opt = ({ kind, icon: Icon, title, sub, color }: any) => (
    <TouchableOpacity
      disabled={!!busy}
      onPress={() => run(kind)}
      activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderColor: C.black, borderRadius: 8, borderRightWidth: 5, borderBottomWidth: 5, borderRightColor: '#0A0A0A', borderBottomColor: '#0A0A0A', padding: 14, marginBottom: 12, opacity: busy && busy !== kind ? 0.4 : 1 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 8, borderWidth: 2, borderColor: color, backgroundColor: color + '1A', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.h3}>{busy === kind ? 'Preparing…' : title}</Text>
        <Text style={S.small}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
  return (
    <Sheet visible={!!spec} title={`Export ${spec?.name || ''}`} subtitle="Choose a format" onClose={() => !busy && onClose()}>
      <Opt kind="excel" icon={FileSpreadsheet} title="Excel (.csv)" sub="Opens in Excel or Google Sheets" color="#00A070" />
      <Opt kind="pdf" icon={FileText} title="PDF" sub="Opens the print screen: choose “Save as PDF”" color={C.danger} />
      <Text style={[S.small, { fontFamily: FONT.medium }]}>Exports everything that matches your current search and filters, not just this page.</Text>
    </Sheet>
  );
}
