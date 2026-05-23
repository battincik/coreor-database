'use client';

import { Minus, X, LogOut, Settings, User } from 'lucide-react';
import { IconBrowserMaximize, IconMenu2 } from '@tabler/icons-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

declare global {
  interface Window {
    topbarControl?: {
      sendAction: (type: 'minimize' | 'maximize' | 'close') => void;
    };
  }
}

export default function Topbar() {
  const handleWindowAction = (type: 'minimize' | 'maximize' | 'close') => {
    window.topbarControl?.sendAction(type);
  };

  return (
    <div className="topbar flex items-center justify-between bg-background text-foreground h-8" style={{ WebkitAppRegion: 'drag', userSelect: 'none' } as React.CSSProperties}>
      <div className="topbar-left flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Image src="/logo.png" width={24} height={24} className="pl-2" alt="Logo" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 data-[state=open]:bg-muted/50">
              <IconMenu2 size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="text-xs">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Veritabanı</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Veritabanlarını Yönet</DropdownMenuItem>
                <DropdownMenuItem>Veritabanı Ekle</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Tanımlı Veritabanları</DropdownMenuLabel>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Görünüm</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Seçim</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="topbar-middle"></div>

      <div className="topbar-right flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="h-6 w-6 flex items-center justify-center cursor-pointer">
              <AvatarImage src="https://github.com/battincik.png" alt="Avatar" />
              <AvatarFallback>B</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Hesap
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Ayarlar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-500">
              <LogOut className="mr-2 h-4 w-4" />
              Oturumu Kapat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" onClick={() => handleWindowAction('minimize')} title="Simge Durumuna Küçült">
          <Minus size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => handleWindowAction('maximize')} title="Büyüt">
          <IconBrowserMaximize size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => handleWindowAction('close')} title="Kapat">
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}
