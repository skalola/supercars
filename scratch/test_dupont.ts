async function main() {
  const res = await fetch("https://dupontregistry.com/autos/results/lamborghini", {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text.substring(0, 500));
}
main();
