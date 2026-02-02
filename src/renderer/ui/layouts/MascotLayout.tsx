import type { FunctionalComponent, JSX } from 'preact';

type MascotLayoutProps = {
  children: JSX.Element;
};

export const MascotLayout: FunctionalComponent<MascotLayoutProps> = ({
  children,
}) => (
  <div class="fixed inset-0 pointer-events-none overflow-hidden">
    {children}
  </div>
);
