"use client";
import { useEffect, useState } from "react";
import { findOptimalItemsForAllChampions } from "./optima/sim";
import type { Character, Item } from "./optima/sim";

export default function Home() {
  const [results, setResults] = useState<
    {
      champion: Character;
      bestItems: Item[];
      bestDPS: number;
      breakdown: string[];
    }[]
  >([]);
  const [sortBy, setSortBy] = useState<"champion" | "dps">("dps");

  useEffect(() => {
    findOptimalItemsForAllChampions().then(setResults);
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">
        Optimal Items for All Champions
      </h1>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg shadow">
          <thead>
            <tr>
              <th
                className="px-6 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer"
                onClick={() =>
                  setSortBy(sortBy === "champion" ? "dps" : "champion")
                }
              >
                Champion
              </th>
              <th className="px-6 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Best Items
              </th>
              <th
                className="px-6 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer"
                onClick={() => setSortBy(sortBy === "dps" ? "champion" : "dps")}
              >
                Best DPS
              </th>
              <th className="px-6 py-3 border-b-2 border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Breakdown
              </th>
            </tr>
          </thead>
          <tbody>
            {results
              .slice()
              .sort((a, b) =>
                sortBy === "champion"
                  ? ("Name" in a.champion ? a.champion.Name : "").localeCompare(
                      "Name" in b.champion ? b.champion.Name : ""
                    )
                  : b.bestDPS - a.bestDPS
              )
              .map((result, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-2 border-b border-gray-200 align-top">
                    {"Name" in result.champion
                      ? result.champion.Name
                      : "Unknown"}
                  </td>
                  <td className="px-4 py-2 border-b border-gray-200 align-top">
                    {result.bestItems
                      .map((item) =>
                        "name" in item
                          ? item.name.replace(/\s*\(.*?\)\s*/g, "").trim()
                          : "Unknown"
                      )
                      .join(", ")}
                  </td>
                  <td className="px-4 py-2 border-b border-gray-200 align-top">
                    {result.bestDPS.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 border-b border-gray-200 align-top">
                    <ul className="list-disc pl-4 space-y-0.5">
                      <div className="group relative">
                        <ul className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bg-white shadow-lg rounded p-2 z-10 min-w-100 right-0 top-0">
                          {result.breakdown.map((line, i) => (
                            <li
                              key={i}
                              className="text-gray-600 text-sm leading-tight"
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                        <span className="text-blue-500 cursor-pointer underline">
                          Show Breakdown
                        </span>
                      </div>
                    </ul>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
