import React, { Children, cloneElement, isValidElement, useId, type ReactNode } from 'react';
// Import individual adapters: the package barrel registers unused custom elements too.
import VscodeLabel from '@vscode-elements/react-elements/dist/components/VscodeLabel.js';
export { default as VscodeButton } from '@vscode-elements/react-elements/dist/components/VscodeButton.js';
export { default as VscodeCheckbox } from '@vscode-elements/react-elements/dist/components/VscodeCheckbox.js';
export { default as VscodeTextfield } from '@vscode-elements/react-elements/dist/components/VscodeTextfield.js';
export { default as VscodeTextarea } from '@vscode-elements/react-elements/dist/components/VscodeTextarea.js';
export { default as VscodeSingleSelect } from '@vscode-elements/react-elements/dist/components/VscodeSingleSelect.js';
export { default as VscodeOption } from '@vscode-elements/react-elements/dist/components/VscodeOption.js';
export { default as VscodeBadge } from '@vscode-elements/react-elements/dist/components/VscodeBadge.js';
export { default as VscodeProgressRing } from '@vscode-elements/react-elements/dist/components/VscodeProgressRing.js';
export { default as VscodeTable } from '@vscode-elements/react-elements/dist/components/VscodeTable.js';
export { default as VscodeTableHeader } from '@vscode-elements/react-elements/dist/components/VscodeTableHeader.js';
export { default as VscodeTableHeaderCell } from '@vscode-elements/react-elements/dist/components/VscodeTableHeaderCell.js';
export { default as VscodeTableBody } from '@vscode-elements/react-elements/dist/components/VscodeTableBody.js';
export { default as VscodeTableRow } from '@vscode-elements/react-elements/dist/components/VscodeTableRow.js';
export { default as VscodeTableCell } from '@vscode-elements/react-elements/dist/components/VscodeTableCell.js';

/** Layout plus a real label association across the custom element's shadow root. */
export function Field({ children, className = '' }: { children: ReactNode; className?: string }) {
  const id = `field-${useId().replace(/:/g, '')}`;
  const nodes = Children.toArray(children).filter(
    (node) => typeof node !== 'string' || node.trim(),
  );
  const index = nodes.findIndex(isValidElement);
  return (
    <div className={`field ${className}`}>
      {index > 0 && <VscodeLabel htmlFor={id}>{nodes.slice(0, index)}</VscodeLabel>}
      {nodes
        .slice(Math.max(index, 0))
        .map((node, i) =>
          i === 0 && index > 0 && isValidElement<{ id?: string; label?: string }>(node)
            ? cloneElement(node, { id, label: nodes.slice(0, index).join(' ') })
            : node,
        )}
    </div>
  );
}
export function valueOf(event: Event): string {
  return (event.currentTarget as HTMLElement & { value: string }).value;
}
export function checkedOf(event: Event): boolean {
  return (event.currentTarget as HTMLElement & { checked: boolean }).checked;
}
export function numberOf(event: Event): number {
  const value = valueOf(event);
  return value.trim() ? Number(value) : NaN;
}
