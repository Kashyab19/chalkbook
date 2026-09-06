import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Gym Notebook',icons:{icon:'/favicon.svg'},description:'Your personal workout and body-weight log.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
