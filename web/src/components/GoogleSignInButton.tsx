type Props = { onClick?: () => void };

export function GoogleSignInButton({ onClick }: Props) {
  const handleClick = () => {
    onClick?.();
    window.location.href = '/api/auth/google/start?return=web';
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Sign in with Google"
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '10px 16px',
        borderRadius: 10,
        border: '1px solid rgb(var(--hairline) / 0.18)',
        background: 'rgb(255 255 255)',
        color: 'rgb(20 20 20)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: 'var(--sh-1)',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.79 2.73v2.27h2.9c1.7-1.57 2.69-3.88 2.69-6.64z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.27c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.34A9 9 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.95 10.69A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.69V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.34z" fill="#FBBC05"/>
        <path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.45.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.34C4.66 5.18 6.65 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      <span>Sign in with Google</span>
    </button>
  );
}
