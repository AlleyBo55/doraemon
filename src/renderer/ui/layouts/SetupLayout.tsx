import type { FunctionalComponent, JSX } from 'preact';

type SetupLayoutProps = {
  children: JSX.Element;
};

export const SetupLayout: FunctionalComponent<SetupLayoutProps> = ({
  children,
}) => (
  <div class="h-screen w-screen bg-slate-50 flex items-center justify-center p-6 overflow-hidden">
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-dora-blue flex items-center justify-center">
              <span class="text-white text-lg font-bold">D</span>
            </div>
            <div>
              <h1 class="text-base font-semibold text-slate-800">Doraemon</h1>
              <p class="text-xs text-slate-500">Desktop Companion Setup</p>
            </div>
          </div>
        </div>
        <div class="p-6">{children}</div>
      </div>
    </div>
  </div>
);
