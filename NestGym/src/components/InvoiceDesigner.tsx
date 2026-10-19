import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react-native';
import { settingsAPI } from '../api/api';
import { C, FONT, S } from '../theme';
import {
  ACCENTS, BLOCK_LABELS, FONTS, PRESETS, defaultTemplate, normalizeTemplate, type Block, type InvoiceTemplate,
} from '../lib/invoiceTemplate';
import { Btn, CheckField, Input, Panel, Select, brut, notify } from './ui';

const FONT_OF = { Helvetica: undefined, Times: 'serif', Courier: 'monospace' } as const;

/** Small live preview of the layout: block order, visibility, colours, fonts and borders. */
function Preview({ tpl }: { tpl: InvoiceTemplate }) {
  const T = tpl.theme;
  const fam = FONT_OF[T.font];
  const box = (extra: any = {}) => ({
    borderWidth: T.borders === 'full' ? 1 : 0,
    borderBottomWidth: T.borders === 'none' ? 0 : 1,
    borderColor: T.border,
    ...extra,
  });
  const f = (n: number) => n * T.scale;
  const txt = (extra: any = {}) => ({ fontFamily: fam, color: T.text, fontSize: f(8), ...extra });
  const rows = (b: Block) => Math.min(4, Math.max(2, Number(b.props.minRows) || 3));

  const render = (b: Block) => {
    const p = b.props;
    switch (b.type) {
      case 'title':
        return (
          <View style={[box({ padding: 6, alignItems: p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center' }), p.filled && { backgroundColor: T.primary }]}>
            <Text style={txt({ fontSize: f(11), fontWeight: '700', color: p.filled ? '#fff' : T.text })}>TAX INVOICE</Text>
            {!!p.subtitle && <Text style={txt({ fontSize: f(6), color: p.filled ? '#fff' : T.muted })}>{p.subtitle}</Text>}
          </View>
        );
      case 'header':
        return (
          <View style={[box({ padding: 6, flexDirection: 'row', justifyContent: 'space-between' })]}>
            <View>
              {p.showLogo && <View style={{ width: 34, height: 14, backgroundColor: T.headerBg, marginBottom: 3 }} />}
              <Text style={txt({ fontWeight: '700' })}>Your Gym</Text>
              {p.showAddress && <Text style={txt({ color: T.muted, fontSize: f(6) })}>Address line, City</Text>}
              {p.showTaxIds && <Text style={txt({ color: T.muted, fontSize: f(6) })}>GSTIN 27AABCT1234A1Z5</Text>}
            </View>
            {p.showMeta && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={txt({ fontSize: f(6), color: T.muted })}>Invoice No.</Text>
                <Text style={txt({ fontWeight: '700' })}>INV-0001</Text>
                <Text style={txt({ fontSize: f(6), color: T.muted })}>Invoice date</Text>
              </View>
            )}
          </View>
        );
      case 'parties':
        return (
          <View style={box({ padding: 6 })}>
            <Text style={txt({ fontSize: f(6), color: T.muted })}>{p.label}</Text>
            <Text style={txt({ fontWeight: '700' })}>Rahul Sharma</Text>
            {p.showPhone && <Text style={txt({ fontSize: f(6), color: T.muted })}>9876543210</Text>}
          </View>
        );
      case 'items':
        return (
          <View style={box({ borderBottomWidth: 0 })}>
            <View style={{ flexDirection: 'row', padding: 4, backgroundColor: p.accentHeader ? T.primary : T.headerBg }}>
              <Text style={txt({ flex: 1, fontWeight: '700', fontSize: f(6), color: p.accentHeader ? '#fff' : T.text })}>{p.descLabel}</Text>
              {p.hsn && <Text style={txt({ width: 34, fontWeight: '700', fontSize: f(6), color: p.accentHeader ? '#fff' : T.text })}>HSN</Text>}
              {p.qty && <Text style={txt({ width: 20, fontWeight: '700', fontSize: f(6), color: p.accentHeader ? '#fff' : T.text })}>Qty</Text>}
              {p.rate && <Text style={txt({ width: 30, fontWeight: '700', fontSize: f(6), color: p.accentHeader ? '#fff' : T.text })}>Rate</Text>}
              {p.amount && <Text style={txt({ width: 34, fontWeight: '700', fontSize: f(6), textAlign: 'right', color: p.accentHeader ? '#fff' : T.text })}>Amount</Text>}
            </View>
            {Array.from({ length: rows(b) }).map((_, i) => (
              <View key={i} style={{ flexDirection: 'row', padding: 4, backgroundColor: p.zebra && i % 2 ? '#f6f6f6' : 'transparent', borderTopWidth: T.borders === 'none' ? 0 : 1, borderColor: T.border }}>
                <Text style={txt({ flex: 1, fontSize: f(6) })}>{['Gold membership', 'PT sessions', 'Protein'][i % 3]}</Text>
                {p.hsn && <Text style={txt({ width: 34, fontSize: f(6) })}>999723</Text>}
                {p.qty && <Text style={txt({ width: 20, fontSize: f(6) })}>1</Text>}
                {p.rate && <Text style={txt({ width: 30, fontSize: f(6) })}>6,000</Text>}
                {p.amount && <Text style={txt({ width: 34, fontSize: f(6), textAlign: 'right' })}>6,000</Text>}
              </View>
            ))}
          </View>
        );
      case 'words':
        return (
          <View style={[box({ padding: 5 }), p.tint && { backgroundColor: T.headerBg }]}>
            <Text style={txt({ fontSize: f(6) })}>
              <Text style={{ fontWeight: '700' }}>{p.label} </Text>Seven Thousand Rupees Only
            </Text>
          </View>
        );
      case 'summary':
        return (
          <View style={[box({ padding: 5, flexDirection: p.totalsSide === 'left' ? 'row-reverse' : 'row', gap: 8 })]}>
            <View style={{ flex: 1 }}>
              {p.showBank && <Text style={txt({ fontSize: f(6), color: T.muted })}>Bank: HDFC · IFSC HDFC0001234</Text>}
              {p.showTerms && <Text style={txt({ fontSize: f(6), color: T.muted })}>{p.termsLabel}</Text>}
            </View>
            {p.showTotals && (
              <View style={{ width: 70 }}>
                <Text style={txt({ fontSize: f(6) })}>Subtotal 6,000</Text>
                <Text style={txt({ fontSize: f(7), fontWeight: '700', color: T.primary })}>Total 7,080</Text>
              </View>
            )}
          </View>
        );
      case 'taxSummary':
        return (
          <View style={box({ padding: 5 })}>
            <Text style={txt({ fontSize: f(6), color: T.muted })}>CGST 9% · SGST 9%</Text>
          </View>
        );
      case 'footer':
        return (
          <View style={box({ padding: 5, flexDirection: 'row', justifyContent: 'space-between' })}>
            {p.showDeclaration ? <Text style={txt({ fontSize: f(6), color: T.muted, flex: 1 })}>Declaration</Text> : <View />}
            {p.showSignature && <Text style={txt({ fontSize: f(6) })}>{p.signatoryLabel}</Text>}
          </View>
        );
      case 'note':
        return (
          <Text style={txt({ fontSize: f(6), textAlign: p.align, fontWeight: p.bold ? '700' : '400', padding: 3 })} numberOfLines={2}>
            {p.text}
          </Text>
        );
      case 'spacer':
        return <View style={{ height: Math.min(20, Number(p.height) || 8) }} />;
      case 'divider':
        return <View style={{ height: 1, backgroundColor: p.color || T.border, marginVertical: 3 }} />;
      default:
        return <View style={{ height: 22, backgroundColor: T.headerBg, margin: 3 }} />;
    }
  };

  return (
    <View style={brut({ backgroundColor: '#fff', padding: 8, marginBottom: 14, borderRightWidth: 4, borderBottomWidth: 4 })}>
      <View style={{ padding: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' }}>
        {tpl.blocks.filter(b => b.visible).map(b => (
          <View key={b.id}>{render(b)}</View>
        ))}
      </View>
    </View>
  );
}

const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} style={brut({ backgroundColor: on ? C.primary : C.white, paddingHorizontal: 10, paddingVertical: 6, borderRightWidth: on ? 2 : 3, borderBottomWidth: on ? 2 : 3 })}>
    <Text style={{ fontFamily: FONT.bold, fontSize: 11, color: on ? '#fff' : C.black, textTransform: 'uppercase' }}>{label}</Text>
  </TouchableOpacity>
);

/** Settings > Invoice design: presets, colours, font, borders, block order/visibility, a few block options. */
export default function InvoiceDesigner({ initial, onSaved }: { initial: any; onSaved: (t: InvoiceTemplate) => void }) {
  const [tpl, setTpl] = useState<InvoiceTemplate>(() => normalizeTemplate(initial));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const get = (type: string) => tpl.blocks.find(b => b.type === type);
  const change = (fn: (t: InvoiceTemplate) => InvoiceTemplate) => {
    setTpl(fn);
    setDirty(true);
  };
  const setTheme = (patch: Partial<InvoiceTemplate['theme']>) => change(t => ({ ...t, theme: { ...t.theme, ...patch } }));
  const setProps = (type: string, patch: Record<string, any>) =>
    change(t => ({ ...t, blocks: t.blocks.map(b => (b.type === type ? { ...b, props: { ...b.props, ...patch } } : b)) }));
  const toggle = (id: string) => change(t => ({ ...t, blocks: t.blocks.map(b => (b.id === id ? { ...b, visible: !b.visible } : b)) }));
  const move = (i: number, d: number) =>
    change(t => {
      const blocks = [...t.blocks];
      const j = i + d;
      if (j < 0 || j >= blocks.length) return t;
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...t, blocks };
    });

  const items = get('items')?.props || {};
  const footer = get('footer')?.props || {};
  const summary = get('summary')?.props || {};
  const title = get('title')?.props || {};

  const save = async () => {
    try {
      setSaving(true);
      const res: any = await settingsAPI.update({ invoiceTemplate: tpl });
      const stored = normalizeTemplate(res.data?.invoiceTemplate ?? tpl);
      setTpl(stored);
      setDirty(false);
      onSaved(stored);
      notify.success('Invoice design saved', 'New invoices will use it.');
    } catch (e: any) {
      notify.error('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => <Preview tpl={tpl} />, [tpl]);

  return (
    <>
      <Text style={[S.small, { marginBottom: 10 }]}>Design how your invoices look. Add logo images, text boxes and watermarks from the web dashboard.</Text>
      {preview}

      <Panel title="Style">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {Object.entries(PRESETS).map(([k, p]) => (
            <Chip key={k} label={p.label} on={false} onPress={() => change(() => p.build())} />
          ))}
        </View>
        <Text style={[S.label, { fontSize: 11, marginBottom: 6 }]}>Accent colour</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          {ACCENTS.map(c => (
            <TouchableOpacity key={c} onPress={() => setTheme({ primary: c })} style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c, borderWidth: tpl.theme.primary === c ? 4 : 2, borderColor: C.black }} />
          ))}
        </View>
        <Select label="Font" options={FONTS} value={tpl.theme.font} onChange={v => setTheme({ font: v as any })} />
        <Select
          label="Borders"
          options={[{ value: 'full', label: 'Boxed' }, { value: 'lines', label: 'Lines only' }, { value: 'none', label: 'None' }]}
          value={tpl.theme.borders}
          onChange={v => setTheme({ borders: v as any })}
        />
        <Text style={[S.label, { fontSize: 11, marginBottom: 6 }]}>Text size</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0.9, 1, 1.1, 1.2].map(s => (
            <Chip key={s} label={`${Math.round(s * 100)}%`} on={tpl.theme.scale === s} onPress={() => setTheme({ scale: s })} />
          ))}
        </View>
      </Panel>

      <Panel title="Sections">
        {tpl.blocks.map((b, i) => (
          <View key={b.id} style={[S.rowBetween, { paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#E5E7EB' }]}>
            <Text style={[S.body, { flex: 1, opacity: b.visible ? 1 : 0.4 }]} numberOfLines={1}>{BLOCK_LABELS[b.type]}</Text>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <TouchableOpacity onPress={() => move(i, -1)} hitSlop={8}><ArrowUp size={18} color={i ? C.black : '#D1D5DB'} /></TouchableOpacity>
              <TouchableOpacity onPress={() => move(i, 1)} hitSlop={8}><ArrowDown size={18} color={i < tpl.blocks.length - 1 ? C.black : '#D1D5DB'} /></TouchableOpacity>
              <TouchableOpacity onPress={() => toggle(b.id)} hitSlop={8}>{b.visible ? <Eye size={18} color={C.primary} /> : <EyeOff size={18} color="#9CA3AF" />}</TouchableOpacity>
            </View>
          </View>
        ))}
      </Panel>

      {!!get('items') && (
        <Panel title="Items table">
          <CheckField hint="Show HSN / SAC code" value={items.hsn} onChange={v => setProps('items', { hsn: v })} />
          <CheckField hint="Show quantity" value={items.qty} onChange={v => setProps('items', { qty: v })} />
          <CheckField hint="Show rate" value={items.rate} onChange={v => setProps('items', { rate: v })} />
          <CheckField hint="Alternate row shading" value={items.zebra} onChange={v => setProps('items', { zebra: v })} />
          <CheckField hint="Coloured header" value={items.accentHeader} onChange={v => setProps('items', { accentHeader: v })} />
        </Panel>
      )}

      <Panel title="Wording">
        {!!get('title') && <Input label="Title note" value={title.subtitle ?? ''} onChangeText={v => setProps('title', { subtitle: v })} placeholder="Original for Recipient" />}
        {!!get('summary') && <Input label="Terms heading" value={summary.termsLabel ?? ''} onChangeText={v => setProps('summary', { termsLabel: v })} />}
        {!!get('footer') && (
          <>
            <Input label="Declaration" multiline value={footer.declaration ?? ''} onChangeText={v => setProps('footer', { declaration: v })} hint="Leave blank for the standard declaration." />
            <Input label="Signatory label" value={footer.signatoryLabel ?? ''} onChangeText={v => setProps('footer', { signatoryLabel: v })} />
          </>
        )}
      </Panel>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Btn label="Save design" busy={saving} disabled={!dirty} onPress={save} /></View>
        <Btn light label="Reset" icon={<RotateCcw size={14} color={C.black} />} onPress={() => change(() => defaultTemplate())} />
      </View>
    </>
  );
}
