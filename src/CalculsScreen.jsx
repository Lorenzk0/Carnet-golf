import React from "react";
import { X } from "lucide-react";
import calculsMd from "./docs/calculs.md?raw";

// Écran « Comment c'est calculé ? » : affiche src/docs/calculs.md, seule source de la
// documentation des statistiques (lisible aussi telle quelle sur GitHub). Rendu Markdown
// volontairement minimal, limité à ce que ce fichier utilise : titres #/##, paragraphes,
// listes "- ", blocs ``` et tableaux, avec **gras** et `code` en ligne.

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="bg-stone-100 rounded px-1 text-[0.85em]">{part.slice(1, -1)}</code>;
    return part;
  });
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function parseBlocks(md) {
  const lines = md.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: code.join("\n") });
    } else if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: line.slice(2) });
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3) });
      i++;
    } else if (line.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      blocks.push({ type: "ul", items });
    } else if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(tableCells(lines[i++]));
      // 2e ligne = séparateur "| --- | --- |"
      blocks.push({ type: "table", head: rows[0], rows: rows.slice(2) });
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#|- |\||```)/.test(lines[i])) para.push(lines[i++]);
      blocks.push({ type: "p", text: para.join(" ") });
    }
  }
  return blocks;
}

const BLOCKS = parseBlocks(calculsMd);

export default function CalculsScreen({ onBack }) {
  const title = BLOCKS.find((b) => b.type === "h1")?.text;
  return (
    <div className="min-h-screen bg-stone-50 pb-10">
      <div className="bg-emerald-900 text-white px-5 pt-8 pb-6 flex items-center gap-3">
        <button onClick={onBack}><X size={22} /></button>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      <div className="p-5 space-y-3 text-sm text-stone-700 leading-relaxed">
        {BLOCKS.map((b, k) => {
          if (b.type === "h1") return null;
          if (b.type === "h2") return <h2 key={k} className="text-base font-bold text-emerald-900 pt-4">{b.text}</h2>;
          if (b.type === "p") return <p key={k}>{inline(b.text)}</p>;
          if (b.type === "ul") {
            return (
              <ul key={k} className="list-disc pl-5 space-y-1">
                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
              </ul>
            );
          }
          if (b.type === "code") {
            return <pre key={k} className="bg-white border border-stone-200 rounded-xl p-3 text-xs overflow-x-auto whitespace-pre-wrap">{b.text}</pre>;
          }
          if (b.type === "table") {
            return (
              <table key={k} className="w-full text-xs bg-white border border-stone-200 rounded-xl overflow-hidden">
                <thead className="bg-stone-100 text-stone-500">
                  <tr>{b.head.map((h, j) => <th key={j} className="p-2 text-left">{inline(h)}</th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j} className="border-t border-stone-100">
                      {r.map((c, m) => <td key={m} className="p-2">{inline(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
