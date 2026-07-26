'use client';

import React from 'react';
import { DatabaseZap, Gauge, RotateCcw, Settings2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppPreferences } from '@/lib/appPreferences';
import { SettingRow, SettingsPageShell, SettingsSection, settingControlClass } from '../components/settings-page-shell';

export default function AdvancedSettingsPage() {
  const { preferences, setPreferences, resetPreferences } = useAppPreferences();
  return (
    <SettingsPageShell activeTab="advanced" icon={Settings2} eyebrow="Gelişmiş davranışlar" title="Gelişmiş" description="Sorgu, process merkezi, içe aktarma ve çalışma alanı davranışlarını yönetin.">
      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsSection title="Sorgu motoru" description="Bu tercihler istemci davranışını belirler; sunucu güvenlik üst sınırlarını aşamaz.">
          <SettingRow title="SQL otomatik tamamlama" description="Anahtar kelime, tablo ve kolon önerilerini gösterir." control={<input type="checkbox" checked={preferences.autocomplete} onChange={event => setPreferences({ autocomplete: event.target.checked })} />} />
          <SettingRow title="Tehlikeli sorgularda doğrulama" description="DROP, TRUNCATE ve koşulsuz DELETE gibi işlemler için ek onay ister." control={<input type="checkbox" checked={preferences.confirmDangerousQueries} onChange={event => setPreferences({ confirmDangerousQueries: event.target.checked })} />} />
          <SettingRow title="Varsayılan sonuç üst sınırı" control={<select className={`${settingControlClass} w-40`} value={preferences.queryResultLimit} onChange={event => setPreferences({ queryResultLimit: Number(event.target.value) })}><option value="100">100</option><option value="500">500</option><option value="1000">1.000</option><option value="5000">5.000</option><option value="10000">10.000</option><option value="50000">50.000</option></select>} />
        </SettingsSection>

        <SettingsSection title="Process ve kilit merkezi">
          <SettingRow title="Otomatik yenileme" description="Process modalı açıkken her 5 saniyede bir yeniler." control={<input type="checkbox" checked={preferences.autoRefreshProcesses} onChange={event => setPreferences({ autoRefreshProcesses: event.target.checked })} />} />
          <div className="rounded-lg border bg-amber-500/[0.05] p-3 text-[11px] leading-5 text-amber-200"><div className="mb-1 flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4" /> Yetki notu</div>Process listesi için PROCESS, metadata lock ayrıntıları için performance_schema erişimi ve sorgu sonlandırma için yeterli yönetim yetkisi gerekir.</div>
        </SettingsSection>

        <SettingsSection title="İçe aktarma">
          <SettingRow title="Batch satır sayısı" description="CSV/JSON import sırasında her API isteğine gönderilen satır miktarı." control={<select className={`${settingControlClass} w-40`} value={preferences.importBatchSize} onChange={event => setPreferences({ importBatchSize: Number(event.target.value) })}><option value="25">25</option><option value="100">100</option><option value="250">250</option><option value="500">500</option><option value="1000">1.000</option></select>} />
          <div className="rounded-lg border p-3 text-[11px] text-muted-foreground"><DatabaseZap className="mb-2 h-4 w-4 text-cyan-400" />Küçük batch daha az bellek kullanır; büyük batch daha hızlıdır ancak proxy ve API gövde sınırına daha çabuk ulaşır.</div>
        </SettingsSection>

        <SettingsSection title="Çalışma alanı">
          <SettingRow title="Panel boyutlarını hatırla" description="Sidebar genişliği ve sürüklenebilir panel oranlarını cihazda saklar." control={<input type="checkbox" checked={preferences.rememberPanelSizes} onChange={event => setPreferences({ rememberPanelSizes: event.target.checked })} />} />
          <SettingRow title={`Varsayılan sidebar: %${Math.round(preferences.sidebarSize)}`} control={<input type="range" min="12" max="45" step="1" value={preferences.sidebarSize} onChange={event => setPreferences({ sidebarSize: Number(event.target.value) })} className="w-44" />} />
          <div className="rounded-lg border p-3 text-[11px] text-muted-foreground"><Gauge className="mb-2 h-4 w-4 text-emerald-400" />Sidebar ayrıca editör içindeki sürükleme tutamacıyla anlık olarak değiştirilebilir.</div>
        </SettingsSection>
      </div>
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={resetPreferences}><RotateCcw className="mr-2 h-4 w-4" /> Tüm gelişmiş tercihleri sıfırla</Button></div>
    </SettingsPageShell>
  );
}
