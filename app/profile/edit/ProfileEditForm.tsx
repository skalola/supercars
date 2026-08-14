"use client";

import { useActionState, useEffect, useState } from "react";
import Image from "next/image";
import { updateProfileAction, type UpdateProfileState } from "@/app/actions/profile";

type ProfileEditFormProps = {
  user: {
    name: string | null;
    username: string | null;
    email: string | null;
    image: string | null;
  };
};

const initialState: UpdateProfileState = {};

export function ProfileEditForm({ user }: ProfileEditFormProps) {
  const [state, action, pending] = useActionState(updateProfileAction, initialState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(user.image);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleProfileImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  return (
    <form action={action} className="profile-edit-form">
      <label>
        <span>Display name</span>
        <input
          name="name"
          type="text"
          defaultValue={user.name || ""}
          placeholder="Your name"
          autoComplete="name"
          maxLength={80}
        />
      </label>

      <label>
        <span>Username</span>
        <input
          name="username"
          type="text"
          defaultValue={user.username || ""}
          placeholder="your-garage"
          autoComplete="username"
          minLength={3}
          maxLength={32}
          pattern="[a-z0-9_-]+"
          required
        />
        <small>Used for your public garage URL.</small>
      </label>

      <div className="profile-edit-photo-field">
        <span>Profile photo</span>
        <div className="profile-edit-photo-control">
          {previewUrl ? (
            <Image src={previewUrl} alt="Profile photo preview" width={64} height={64} unoptimized />
          ) : (
            <span aria-hidden="true" />
          )}
          <label>
            <strong>Choose Photo</strong>
            <input
              name="profileImage"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleProfileImageChange}
            />
          </label>
        </div>
        <small>JPG, PNG, or WebP. Maximum 8 MB.</small>
      </div>

      <label>
        <span>Email</span>
        <input
          type="email"
          value={user.email || ""}
          disabled
        />
        <small>Email comes from your login provider.</small>
      </label>

      {state.error ? <p className="profile-edit-message is-error">{state.error}</p> : null}
      {state.ok ? <p className="profile-edit-message is-success">Profile updated.</p> : null}

      <button type="submit" className="profile-edit-submit" disabled={pending}>
        {pending ? "Saving..." : "Save Profile"}
      </button>
    </form>
  );
}
