import { importLiveGameFromRiotId } from "../src/lib/opggLiveGame";

async function main() {
  for (const region of ["EUW", "NA"]) {
    try {
      const result = await importLiveGameFromRiotId("NattyNatt#2005", region);
      console.log(region, "OK", result);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.log(region, err.code, err.message);
    }
  }
}

void main();
