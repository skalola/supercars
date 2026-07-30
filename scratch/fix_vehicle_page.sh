# Remove the stray lines
sed -i '' -e '/if (resolvedHeroImage === "\/images\/placeholder.jpg"/,+2d' app/vehicle/\[vin\]/page.tsx

# Insert it right after the activeListing definition ends
sed -i '' -e '/const activeListing = \[...vehicle.listings\]/,/    }\)\[0\];/!b' -e '/    }\)\[0\];/a\
\
  if (resolvedHeroImage === "/images/placeholder.jpg" \&\& activeListing?.imageUrl) {\
    resolvedHeroImage = activeListing.imageUrl;\
  }' app/vehicle/\[vin\]/page.tsx
