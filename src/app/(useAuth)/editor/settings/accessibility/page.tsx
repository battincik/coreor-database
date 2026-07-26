'use client';

import React from 'react';
import { Accessibility, Eye, Focus, Move } from 'lucide-react';
import { useAppPreferences } from '@/lib/appPreferences';
import { SettingRow, SettingsPageShell, SettingsSection, settingControlClass } from '../components/settings-page-shell';

export default function AccessibilitySettingsPage() {
  const { preferences, setPreferences } = useAppPreferences();
  return (
    <SettingsPageShell activeTab="accessibility" icon={Accessibility} eyebrow="Erişilebilirlik" title="Erişilebilirlik" description="Hareket, kontrast, odak, renk algısı ve okunabilirlik seçeneklerini ihtiyaçlarınıza göre ayarlayın.">
      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsSection title="Hareket ve odak" description="Klavye ve hareket hassasiyeti olan kullanıcılar için.">
          <SettingRow title="Azaltılmış hareket" description="Animasyonları ve geçişleri neredeyse tamamen kapatır." control={<input type="checkbox" checked={preferences.reducedMotion} onChange={event => setPreferences({ reducedMotion: event.target.checked })} />} />
          <SettingRow title="Güçlü klavye odak halkası" description="Tab ile gezinirken aktif kontrolü iki piksellik halka ile gösterir." control={<input type="checkbox" checked={preferences.strongFocusRing} onChange={event => setPreferences({ strongFocusRing: event.target.checked })} />} />
          <div className="rounded-lg border p-3 text-xs"><div className="mb-2 flex items-center gap-2 font-medium"><Focus className="h-4 w-4 text-cyan-400" /> Odak önizlemesi</div><div className="flex gap-2"><button className="rounded border px-3 py-2 focus-visible:outline">Birinci kontrol</button><button className="rounded border px-3 py-2 focus-visible:outline">İkinci kontrol</button></div></div>
        </SettingsSection>

        <SettingsSection title="Görsel ayrım" description="Renk ve sınırları daha belirgin hale getirir.">
          <SettingRow title="Yüksek kontrastlı sınırlar" control={<input type="checkbox" checked={preferences.highContrastBorders} onChange={event => setPreferences({ highContrastBorders: event.target.checked })} />} />
          <SettingRow title="Renk körlüğü filtresi" control={<select className={`${settingControlClass} w-52`} value={preferences.colorBlindMode} onChange={event => setPreferences({ colorBlindMode: event.target.value as typeof preferences.colorBlindMode })}><option value="none">Kapalı</option><option value="protanopia">Protanopia</option><option value="deuteranopia">Deuteranopia</option><option value="tritanopia">Tritanopia</option></select>} />
          <div className="rounded-lg border p-3"><div className="mb-2 flex items-center gap-2 text-xs font-medium"><Eye className="h-4 w-4 text-emerald-400" /> Durum renkleri</div><div className="grid grid-cols-4 gap-2 text-center text-[10px]"><span className="rounded bg-emerald-500/20 p-2 text-emerald-300">Başarılı</span><span className="rounded bg-red-500/20 p-2 text-red-300">Hata</span><span className="rounded bg-amber-500/20 p-2 text-amber-300">Uyarı</span><span className="rounded bg-cyan-500/20 p-2 text-cyan-300">Bilgi</span></div></div>
        </SettingsSection>
      </div>

      <SettingsSection title="Okunabilirlik">
        <SettingRow title="Disleksi dostu harf ve kelime aralığı" description="Metinlerde harf ve kelime aralığını artırır; SQL değerlerinin içeriğini değiştirmez." control={<input type="checkbox" checked={preferences.dyslexiaSpacing} onChange={event => setPreferences({ dyslexiaSpacing: event.target.checked })} />} />
        <div className="rounded-lg border p-4"><div className="mb-2 flex items-center gap-2 text-xs font-medium"><Move className="h-4 w-4 text-purple-400" /> Metin örneği</div><p className="max-w-3xl text-sm leading-6">Veritabanı şeması, tablo ilişkileri ve sorgu sonuçları arasında klavye ile güvenli biçimde gezinebilirsiniz.</p></div>
      </SettingsSection>
    </SettingsPageShell>
  );
}
