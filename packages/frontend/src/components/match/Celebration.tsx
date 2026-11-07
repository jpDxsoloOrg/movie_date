import "./Celebration.css";

const PIECE_COUNT = 14;

/** Falling confetti, played once. The stylesheet removes it under reduced motion. */
export function Celebration(): JSX.Element {
  return (
    <div className="match-celebration" aria-hidden="true">
      {Array.from({ length: PIECE_COUNT }, (_, index) => (
        <span className="match-celebration__piece" key={index} />
      ))}
    </div>
  );
}
