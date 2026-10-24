import React, { type ReactNode } from 'react';
import VscodeTabs from '@vscode-elements/react-elements/dist/components/VscodeTabs.js';
import VscodeTabHeader from '@vscode-elements/react-elements/dist/components/VscodeTabHeader.js';
import VscodeTabPanel from '@vscode-elements/react-elements/dist/components/VscodeTabPanel.js';

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  label,
  actions,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: {
    value: T;
    label: ReactNode;
    content: ReactNode;
    className?: string;
    contentKey?: string;
  }[];
  label: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <VscodeTabs
      className={className}
      aria-label={label}
      selectedIndex={Math.max(
        0,
        items.findIndex((item) => item.value === value),
      )}
      onVscTabsSelect={(event) => {
        const item = items[event.detail.selectedIndex];
        if (item) onChange(item.value);
      }}
    >
      {items.map((item) => (
        <VscodeTabHeader
          key={item.value}
          slot="header"
          className={item.className}
          title={typeof item.label === 'string' ? item.label : undefined}
        >
          {item.label}
        </VscodeTabHeader>
      ))}
      {actions && (
        <div slot="addons" className="tab-actions">
          {actions}
        </div>
      )}
      {items.map((item) => (
        <VscodeTabPanel key={item.contentKey ?? item.value}>{item.content}</VscodeTabPanel>
      ))}
    </VscodeTabs>
  );
}
