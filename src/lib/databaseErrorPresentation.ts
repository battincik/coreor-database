'use client';

export interface DatabaseErrorPayload {
  error?: string;
  message?: string;
  reauthenticate?: boolean;
}

export class DatabaseClientError extends Error {
  constructor(
    message: string,
    public readonly code = 'DATABASE_CLIENT_ERROR',
    public readonly status = 0,
    public readonly hint?: string,
    public readonly retryable = false,
    public readonly reauthenticate = false
  ) {
    super(hint ? `${message} ${hint}` : message);
    this.name = 'DatabaseClientError';
  }
}

interface ErrorGuidance {
  message: string;
  hint?: string;
  retryable?: boolean;
  reauthenticate?: boolean;
}

const ERROR_GUIDANCE: Record<string, ErrorGuidance> = {
  UNAUTHORIZED: {
    message: 'Oturumunuz doğrulanamadı.',
    hint: 'GitHub ile yeniden giriş yapıp işlemi tekrar deneyin.',
    reauthenticate: true
  },
  SESSION_INVALID: {
    message: 'Oturumunuz artık geçerli değil.',
    hint: 'GitHub ile yeniden giriş yapın.',
    reauthenticate: true
  },
  AUTH_USER_NOT_ALLOWED: {
    message: 'Bu GitHub hesabının veritabanı çalışma alanına erişim izni yok.',
    hint: 'Hesabın GitHub kullanıcı ID’sini uygulamanın erişim listesine ekleyin.'
  },
  CROSS_ORIGIN_REQUEST_REJECTED: {
    message: 'İstek güvenlik politikası nedeniyle reddedildi.',
    hint: 'Uygulamayı yapılandırılmış ana adresinden açıp tekrar deneyin.'
  },
  DATABASE_HOST_NOT_ALLOWED: {
    message: 'Bu veritabanı sunucusuna bağlantıya izin verilmiyor.',
    hint: 'Host adresini PROD veritabanı allowlist ayarına ekleyin.'
  },
  PRIVATE_DATABASE_HOST_NOT_ALLOWED: {
    message: 'Özel veya yerel ağdaki bu veritabanı hedefi izinli değil.',
    hint: 'Sunucuyu açıkça veritabanı host allowlist’ine ekleyin.'
  },
  DATABASE_PORT_NOT_ALLOWED: {
    message: 'Bu veritabanı portuna bağlantıya izin verilmiyor.',
    hint: 'Portu sunucu tarafındaki izin verilen port listesine ekleyin.'
  },
  DATABASE_AUTHENTICATION_FAILED: {
    message: 'Veritabanı kullanıcı bilgilerini kabul etmedi.',
    hint: 'Kullanıcı adı, parola ve host bazlı kullanıcı yetkisini kontrol edin.'
  },
  ER_ACCESS_DENIED_ERROR: {
    message: 'Veritabanı kullanıcı bilgilerini kabul etmedi.',
    hint: 'Kullanıcı adı, parola ve host bazlı kullanıcı yetkisini kontrol edin.'
  },
  DATABASE_HOST_NOT_FOUND: {
    message: 'Veritabanı sunucusunun adresi çözümlenemedi.',
    hint: 'Host adını ve DNS kaydını kontrol edin.',
    retryable: true
  },
  ENOTFOUND: {
    message: 'Veritabanı sunucusunun adresi çözümlenemedi.',
    hint: 'Host adını ve DNS kaydını kontrol edin.',
    retryable: true
  },
  EAI_AGAIN: {
    message: 'DNS geçici olarak veritabanı adresini çözemedi.',
    hint: 'Kısa süre sonra tekrar deneyin.',
    retryable: true
  },
  DATABASE_CONNECTION_TIMEOUT: {
    message: 'Veritabanı sunucusuna zamanında ulaşılamadı.',
    hint: 'Sunucunun çalıştığını, portu, firewall’u ve ağ rotasını kontrol edin.',
    retryable: true
  },
  ETIMEDOUT: {
    message: 'Veritabanı bağlantısı zaman aşımına uğradı.',
    hint: 'Ağ erişimini ve bağlantı timeout ayarını kontrol edin.',
    retryable: true
  },
  ECONNREFUSED: {
    message: 'Veritabanı sunucusu bağlantıyı reddetti.',
    hint: 'Servisin ilgili portta dinlediğini ve firewall kuralını kontrol edin.',
    retryable: true
  },
  DATABASE_TLS_VERIFICATION_FAILED: {
    message: 'Veritabanının TLS sertifikası doğrulanamadı.',
    hint: 'Sertifika zinciri, geçerlilik tarihi ve bağlandığınız hostname’i kontrol edin.'
  },
  DATABASE_NOT_FOUND: {
    message: 'Seçilen veritabanı bulunamadı veya bu kullanıcı tarafından erişilemiyor.',
    hint: 'Veritabanı adını ve kullanıcı yetkilerini kontrol edin.'
  },
  DATABASE_TABLE_NOT_FOUND: {
    message: 'İşlem yapılmak istenen tablo bulunamadı.',
    hint: 'Şema veya tablo listesini yenileyip tekrar deneyin.'
  },
  DATABASE_SQL_SYNTAX_ERROR: {
    message: 'SQL sorgusu veritabanı tarafından sözdizimi hatasıyla reddedildi.',
    hint: 'Hatalı statement bölümünü ve kullandığınız veritabanı dialect’ini kontrol edin.'
  },
  ER_PARSE_ERROR: {
    message: 'SQL sorgusunda sözdizimi hatası var.',
    hint: 'Hatalı statement bölümünü kontrol edin.'
  },
  DATABASE_UNIQUE_CONSTRAINT: {
    message: 'İşlem benzersiz alan kısıtını ihlal ediyor.',
    hint: 'Aynı unique/primary key değerine sahip mevcut kaydı kontrol edin.'
  },
  ER_DUP_ENTRY: {
    message: 'Aynı benzersiz değere sahip bir kayıt zaten var.',
    hint: 'Unique veya primary key değerini kontrol edin.'
  },
  READ_ONLY_PROFILE: {
    message: 'Bu bağlantı profili salt-okunur olduğu için değişiklik yapılamadı.',
    hint: 'Yazma işlemi gerekiyorsa profil ayarındaki salt-okunur seçeneğini bilinçli olarak kapatın.'
  },
  DATABASE_RATE_LIMITED: {
    message: 'Kısa sürede çok fazla veritabanı isteği gönderildi.',
    hint: 'Bir süre bekleyip tekrar deneyin.',
    retryable: true
  },
  DATABASE_REQUEST_TOO_LARGE: {
    message: 'Gönderilen veri izin verilen istek boyutunu aşıyor.',
    hint: 'Dosyayı veya işlemi daha küçük parçalara bölün.'
  },
  BLOB_TOO_LARGE: {
    message: 'BLOB verisi izin verilen boyutu aşıyor.',
    hint: 'Daha küçük bir dosya kullanın veya sunucu limitini kontrollü şekilde yükseltin.'
  },
  TRANSACTION_NOT_FOUND: {
    message: 'Açık transaction artık bulunamıyor.',
    hint: 'Transaction’ı yeniden başlatın; sunucu restart veya timeout nedeniyle kapanmış olabilir.'
  },
  DATABASE_API_UNREACHABLE: {
    message: 'Uygulamanın veritabanı API’sine ulaşılamadı.',
    hint: 'İnternet bağlantısını ve uygulama sunucusunun durumunu kontrol edin.',
    retryable: true
  },
  DATABASE_API_INVALID_RESPONSE: {
    message: 'Veritabanı API’si beklenmeyen bir yanıt döndürdü.',
    hint: 'Sayfayı yenileyin; sorun sürerse sunucu loglarını kontrol edin.',
    retryable: true
  }
};

function safeDetail(message: string | undefined) {
  const normalized = message?.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 320) return undefined;
  return normalized;
}

function guidanceFor(code: string, status: number, serverMessage?: string): ErrorGuidance {
  const known = ERROR_GUIDANCE[code];
  if (known) return known;
  if (status === 401) return ERROR_GUIDANCE.UNAUTHORIZED;
  if (status === 403) {
    return {
      message: 'Bu veritabanı işlemi için gerekli erişim izni yok.',
      hint: 'Oturum ve sunucu tarafı erişim politikasını kontrol edin.'
    };
  }
  if (status === 429) return ERROR_GUIDANCE.DATABASE_RATE_LIMITED;
  if (status >= 500) {
    return {
      message: 'Veritabanı işlemi sunucu tarafında tamamlanamadı.',
      hint: 'Tekrar deneyin; sorun sürerse uygulama ve veritabanı loglarını kontrol edin.',
      retryable: true
    };
  }

  const detail = safeDetail(serverMessage);
  return {
    message: detail || 'Veritabanı işlemi tamamlanamadı.',
    hint: code ? `Hata kodu: ${code}.` : undefined
  };
}

export function createDatabaseClientError(payload: DatabaseErrorPayload | null, status: number) {
  const code = payload?.error || (status === 401 ? 'UNAUTHORIZED' : 'DATABASE_REQUEST_FAILED');
  const guidance = guidanceFor(code, status, payload?.message);
  return new DatabaseClientError(
    guidance.message,
    code,
    status,
    guidance.hint,
    Boolean(guidance.retryable),
    Boolean(payload?.reauthenticate || guidance.reauthenticate)
  );
}

export function normalizeDatabaseClientError(error: unknown) {
  if (error instanceof DatabaseClientError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new DatabaseClientError('İstek iptal edildi.', 'DATABASE_REQUEST_ABORTED', 0, 'İşlemi tekrar başlatabilirsiniz.', true);
  }
  if (error instanceof TypeError) {
    const guidance = ERROR_GUIDANCE.DATABASE_API_UNREACHABLE;
    return new DatabaseClientError(guidance.message, 'DATABASE_API_UNREACHABLE', 0, guidance.hint, true);
  }
  if (error instanceof Error) {
    const candidate = error as Error & { code?: string; status?: number };
    const code = candidate.code || 'DATABASE_CLIENT_ERROR';
    const status = candidate.status || 0;
    const guidance = guidanceFor(code, status, candidate.message);
    return new DatabaseClientError(guidance.message, code, status, guidance.hint, Boolean(guidance.retryable));
  }
  return new DatabaseClientError('Bilinmeyen bir veritabanı hatası oluştu.', 'DATABASE_CLIENT_ERROR', 0, 'İşlemi tekrar deneyin.', true);
}

export async function readDatabaseApiResponse<T>(response: Response) {
  const raw = await response.text();
  let body: T | DatabaseErrorPayload | null = null;

  if (raw) {
    try {
      body = JSON.parse(raw) as T | DatabaseErrorPayload;
    } catch {
      throw new DatabaseClientError(
        'Veritabanı API’si okunamayan bir yanıt döndürdü.',
        'DATABASE_API_INVALID_RESPONSE',
        response.status,
        'Sayfayı yenileyin; sorun sürerse uygulama sunucusu loglarını kontrol edin.',
        true
      );
    }
  }

  if (!response.ok) throw createDatabaseClientError(body as DatabaseErrorPayload | null, response.status);
  return body as T;
}
