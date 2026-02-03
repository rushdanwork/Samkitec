export default function Logo() {
  const logoSrc = `${import.meta.env.BASE_URL}assets/logo_eye.png`;

  return <img src={logoSrc} alt="eye logo" className="h-12 w-auto" />;
}
