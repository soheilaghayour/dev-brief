import { Fragment } from 'react';
import type { SourceRef } from '@devbrief/shared';
import { combinedSourceLine } from './combinedSourceLine';

export type ClusterSourceLineProps = { sources: SourceRef[] };

/** A cluster card's source line, e.g. "Trending on HN (▲ 320) & Dev.to (♥ 95) · 2 blogs". */
export function ClusterSourceLine({ sources }: ClusterSourceLineProps) {
  return (
    <span>
      {combinedSourceLine(sources).map(({ kind, joiner, name, metric }) => (
        <Fragment key={kind}>
          {joiner}
          <span data-source-kind={kind}>
            {name}
            {metric && (
              <>
                {' ('}
                <span aria-hidden="true">{metric.glyph} </span>
                {metric.value}
                <span className="sr-only"> {metric.label}</span>)
              </>
            )}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
