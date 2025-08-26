

'use client';

import {
  Menubar,
  MenubarContent,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar"
import dynamic from 'next/dynamic';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
});


export default function Home() {

  return (
    <main className="flex flex-col h-screen">
      <header className="flex h-14 items-center border-b px-4 flex-shrink-0">
        <h1 className="text-xl font-bold">HydroBIM</h1>
        <Menubar className="ml-6 border-none shadow-none">
          <MenubarMenu>
            <MenubarTrigger>Archivo</MenubarTrigger>
            <MenubarContent></MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Datos</MenubarTrigger>
            <MenubarContent></MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Mapa GIS</MenubarTrigger>
            <MenubarContent></MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Modelado</MenubarTrigger>
            <MenubarContent></MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Simulación</MenubarTrigger>
            <MenubarContent></MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Configuración</MenubarTrigger>
            <MenubarContent></MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Ayuda</MenubarTrigger>
            <MenubarContent></MenubarContent>
          </MenubarMenu>
        </Menubar>
      </header>
      <div className="flex-grow relative">
         <Map />
         <div className="absolute bottom-4 left-4 z-[1000] p-2 bg-white/70 rounded-md shadow-md text-xs">
            <div>Autor: Ing. Rulli Llancari Anyaipoma</div>
            <div>BIM Proyectos Integrados SAC</div>
         </div>
      </div>
    </main>
  );
}

