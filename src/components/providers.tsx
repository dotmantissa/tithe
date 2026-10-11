'use client';
import { PrivyProvider } from '@privy-io/react-auth';
import { ThemeProvider } from 'next-themes';
export function Providers({children}:{children:React.ReactNode}) {
  return <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
    <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={{
      loginMethods:['email'],
      appearance:{theme:'light',accentColor:'#000000',logo:'/logo.svg',showWalletLoginFirst:false,landingHeader:'A little permission goes a long way.',loginMessage:'Sign in with your email. We will take care of the rest.'},
      embeddedWallets:{ethereum:{createOnLogin:'off'}},
    }}>{children}</PrivyProvider>
  </ThemeProvider>;
}
