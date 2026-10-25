import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="section grid gap-6 pt-16">
      <span className="chip justify-self-start">404</span>
      <h1 className="display display--page">Page not found</h1>
      <Link className="btn-primary justify-self-start" to="/">
        Back to overview
      </Link>
    </section>
  );
}
