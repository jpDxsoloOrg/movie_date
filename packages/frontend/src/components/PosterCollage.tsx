import "./PosterCollage.css";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w185/";

/**
 * Fixed paths, because signed-out visitors can't call the API. A dead path just leaves
 * its tinted tile, and the tiles alone still read as a wall of posters.
 */
const POSTER_COLUMNS: readonly (readonly string[])[] = [
  ["9cqNxx0GxF0bflZmeSMuL5tnGzr", "uDO8zWDhfWwoFdKS4fzkUJt0Rf0", "fNOH9f1aA7XRTzl1sAOx9iF553Q", "39wmItIWsg5sZMyRUHLkWBcuVCM"],
  ["gEU2QniE6E77NI6lCU6MxlNBvIx", "3bhkrj58Vtu7enYsRolD1fZdja1", "7IiTTgloJzvGI1TAYymCfbfl3vT", "oU7Oq2kFAAlGqbU4VoAE36g4hoI"],
  ["qJ2tW6WMUDux911r6m7haRef0WH", "9xjZS2rlVxm8SFx8kPC3aIGCOYQ", "oYuLEt3zVCKq57qu2F8dT7NIa6f", "d5iIlFn5s0ImszYzBPb8JPIfbXD"],
  ["6oom5QYQ2yQTMJIbnvbkBL9cHo6", "pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK", "lyQBXzOQSuE59IsHyhrp0qIiPAz", "arw2vcBveWOVZr6pxd9XTd1TdQa"],
  ["sv1xJUazXeYqALzczSZ3O6nkH75", "rCzpDGLbOoPwLjy3OAm5NUPOTrC", "7WsyChQLEftFiDOVTGkv3hFpyyt", "uXDfjJbdP4ijW5hWSBrPrlKpxab"],
  ["1E5baAaEse26fej7uHcjOgEE2t2", "hek3koDUyRQk7FIhPXsa6mT2Zc3", "ow3wq89wM8qd5X7hWKxiRfsFf9C", "5KCVkau1HEl7ZzfPsKAPM0sMiKc"],
];

/** Decorative backdrop. Columns hidden by CSS on small screens don't download: they're lazy. */
export function PosterCollage(): JSX.Element {
  return (
    <div className="md-collage" aria-hidden="true">
      <div className="md-collage__wall">
        {POSTER_COLUMNS.map((column, columnIndex) => (
          <div className="md-collage__column" key={columnIndex}>
            {column.map((posterPath) => (
              <div className="md-collage__poster" key={posterPath}>
                <img src={`${POSTER_BASE_URL}${posterPath}.jpg`} alt="" loading="lazy" decoding="async" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
