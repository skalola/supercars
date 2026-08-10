"use client";

export default function ClubConfirmButton({
  name,
  value,
  children,
  message,
}: {
  name: string;
  value: string;
  children: string;
  message: string;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
