import type { FunctionalComponent, JSX } from 'preact';

type SetupLayoutProps = {
  children: JSX.Element;
};

export const SetupLayout: FunctionalComponent<SetupLayoutProps> = ({ children }) => (
  <div class="h-screen w-screen flex flex-col select-none overflow-hidden">
    <div class="h-[52px] drag-region flex-shrink-0" />
    <div class="flex-1 flex flex-col items-center justify-center px-12 pb-10">
      {children}
    </div>
  </div>
);
