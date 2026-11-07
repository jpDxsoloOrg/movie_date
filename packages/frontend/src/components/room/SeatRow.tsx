import "./SeatRow.css";

export interface SeatRowProps {
  seats: number;
  taken: number;
}

/** Decorative: whatever sits beside it says the same thing in words. */
export function SeatRow({ seats, taken }: SeatRowProps): JSX.Element {
  return (
    <div className="room-seats" aria-hidden="true">
      {Array.from({ length: seats }, (_, index) => (
        <svg
          key={index}
          className={index < taken ? "room-seat room-seat--taken" : "room-seat"}
          viewBox="0 0 32 32"
          width="32"
          height="32"
        >
          <path d="M8 4h16a3 3 0 0 1 3 3v12H5V7a3 3 0 0 1 3-3z" />
          <path d="M2 14a2 2 0 0 1 2-2 2 2 0 0 1 2 2v7h20v-7a2 2 0 0 1 2-2 2 2 0 0 1 2 2v11H2z" />
        </svg>
      ))}
    </div>
  );
}
