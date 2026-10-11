import type { Metadata } from 'next';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/500.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
import './globals.css';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
export const metadata: Metadata = {
  title: {default:'Tithe | Your work. Your terms. Your share.',template:'%s | Tithe'},
  description:'A home for your work, a price for permission, and a fair hearing when the line gets blurry. Private licensing and arbitration on GenLayer.',
  icons:{icon:'/icon.svg',apple:'/logo.svg'},
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" suppressHydrationWarning><body><Providers><Shell>{children}</Shell></Providers></body></html>;
}
