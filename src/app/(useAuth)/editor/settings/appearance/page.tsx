'use client';

import React from 'react';
import { Monitor, RotateCcw, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppPreferences, type AppThemeName, type SyntaxThemeName } from '@/lib/appPreferences';
import { SettingRow, SettingsPageShell, SettingsSection, settingControlClass } from '../components/settings-page-shell';

const themes: Array<{ id: AppThemeName; title: string; description: string; swatches: string[] }> = [
  { id: 'amoled', title: 'AMOLED', description: 'Gerçek siyah, yüksek kontrast ve düşük ışık.', swatches: ['#000000', '#0a0a0a', '#22d3ee'] },
  { id: 'graphite', title: 'Graphite', description: 'Nötr koyu gri çalışma alanı.', swatches: ['#13151a', '#20242b', '#38bdf8'] },
  { id: 'midnight', title: 'Midnight', description: 'Lacivert ve mor odak renkleri.', swatches: ['#0b1020', '#171d34', '#a78bfa'] },
  { id: 'nord', title: 'Nord', description: 'Soğuk, yumuşak ve dengeli kontrast.', swatches: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'solarized', title: 'Solarized Dark', description: 'Uzun süreli okuma için sıcak tonlar.', swatches: ['#002b36', '#073642', '#2aa198'] },
  { id: 'light', title: 'Aydınlık', description: 'Gündüz ve yüksek ortam ışığı için.', swatches: ['#f8fafc', '#ffffff', '#0ea5e9'] },
  { id: 'high-contrast', title: 'Yüksek Kontrast', description: 'Sınırlar ve odaklar maksimum görünür.', swatches: ['#000000', '#ffffff', '#fff200'] }
];

const syntaxThemes: Array<{ id: SyntaxThemeName; title: string }> = [
  { id: 'coreor', title: 'Coreor Cyan' }, { id: 'dracula', title: 'Dracula' }, { id: 'nord', title: 'Nord' },
  { id: 'monokai', title: 'Monokai' }, { id: 'github-dark', title: 'GitHub Dark' }, { id: 'github-light', title: 'GitHub Light' }
];

export default function AppearanceSettingsPage() {
  const { preferences, setPreferences, resetPreferences } = useAppPreferences();
  return (
    <SettingsPageShell activeTab="appearance" icon={Monitor} eyebrow="Uygulama görünümü" title="Görünüm" description="Çalışma alanı, SQL editörü, konsol ve yoğunluk ayarlarını cihazınıza özel olarak değiştirin.">
      <SettingsSection title="Tema" description="Tema değişikliği sayfayı yenilemeden bütün çalışma alanına uygulanır.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {themes.map(theme => (
            <button key={theme.id} type="button" onClick={() => setPreferences({ theme: theme.id })} className={`rounded-xl border p-3 text-left transition ${preferences.theme === theme.id ? 'border-primary ring-1 ring-primary/50' : 'hover:border-foreground/30'}`}>
              <div className="mb-3 flex h-16 overflow-hidden rounded-lg border">{theme.swatches.map((swatch, index) => <span key={swatch} style={{ background: swatch, flex: index === 2 ? .35 : 1 }} />)}</div>
              <div className="text-xs font-semibold">{theme.title}</div><div className="mt-1 text-[11px] text-muted-foreground">{theme.description}</div>
            </button>
          ))}
        </div>
      </SettingsSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsSection title="Yazı ve yoğunluk">
          <SettingRow title="Uygulama fontu" control={<select value={preferences.fontFamily} onChange={event => setPreferences({ fontFamily: event.target.value as typeof preferences.fontFamily })} className={`${settingControlClass} w-48`}><option value="system">Sistem / Inter</option><option value="mono">Monospace</option><option value="humanist">Atkinson / Humanist</option><option value="serif">Serif</option></select>} />
          <SettingRow title={`Arayüz yazı boyutu: ${preferences.uiFontSize}px`} control={<input type="range" min="10" max="18" step="1" value={preferences.uiFontSize} onChange={event => setPreferences({ uiFontSize: Number(event.target.value) })} className="w-44" />} />
          <SettingRow title={`SQL editörü: ${preferences.editorFontSize}px`} control={<input type="range" min="10" max="28" step="1" value={preferences.editorFontSize} onChange={event => setPreferences({ editorFontSize: Number(event.target.value) })} className="w-44" />} />
          <SettingRow title={`Konsol yazısı: ${preferences.consoleFontSize}px`} control={<input type="range" min="8" max="18" step="1" value={preferences.consoleFontSize} onChange={event => setPreferences({ consoleFontSize: Number(event.target.value) })} className="w-44" />} />
          <SettingRow title={`Satır yüksekliği: ${preferences.lineHeight.toFixed(2)}`} control={<input type="range" min="1.2" max="2.2" step="0.05" value={preferences.lineHeight} onChange={event => setPreferences({ lineHeight: Number(event.target.value) })} className="w-44" />} />
          <SettingRow title="Kompakt mod" description="Grid, menü ve araç çubuğu satırlarını daha sıkı gösterir." control={<input type="checkbox" checked={preferences.compactMode} onChange={event => setPreferences({ compactMode: event.target.checked })} />} />
        </SettingsSection>

        <SettingsSection title="SQL syntax görünümü" description="Editör arka planı, metin ve seçim tonları değişir.">
          <div className="grid grid-cols-2 gap-2">{syntaxThemes.map(theme => <button key={theme.id} type="button" onClick={() => setPreferences({ syntaxTheme: theme.id })} className={`rounded-lg border p-2 text-left text-xs ${preferences.syntaxTheme === theme.id ? 'border-primary bg-primary/10' : 'hover:bg-muted/40'}`}><div className="coreor-sql-editor rounded p-2 font-mono text-[10px]">SELECT * FROM users;</div><div className="mt-2">{theme.title}</div></button>)}</div>
          <div className="rounded-lg border p-3"><div className="mb-2 flex items-center gap-2 text-xs font-medium"><Type className="h-4 w-4" /> Canlı önizleme</div><pre className="coreor-sql-editor overflow-x-auto rounded-lg border p-3 font-mono">{`SELECT u.id, u.email\nFROM users AS u\nWHERE u.enabled = TRUE\nORDER BY u.created_at DESC;`}</pre></div>
        </SettingsSection>
      </div>

      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={resetPreferences}><RotateCcw className="mr-2 h-4 w-4" /> Görünüm ayarlarını sıfırla</Button></div>
    </SettingsPageShell>
  );
}
