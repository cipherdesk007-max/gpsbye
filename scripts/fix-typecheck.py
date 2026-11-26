#!/usr/bin/env python3
"""Fix di sola compilazione per RelocViewModel.swift (riga ~440).

Il type-checker di Swift (Xcode 16.4 e 26.3) va in timeout sulla catena di 8 `??`
che sceglie il nome del luogo. La sostituiamo con un array di candidati e
prendiamo il primo non-nil: stesso ordine, stesso risultato, logica invariata.

Va eseguito DOPO scripts/bootstrap.sh (che verifica i checksum dei sorgenti
originali). Fallisce se il blocco atteso non c'è esattamente una volta.
"""
import sys

PATH = "Reloc/Core/Swift/RelocViewModel.swift"

OLD = """            let name = (json["name"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                ?? (addrDict["road"] as? String)
                ?? (addrDict["neighbourhood"] as? String)
                ?? (addrDict["suburb"] as? String)
                ?? (addrDict["city"] as? String)
                ?? (addrDict["town"] as? String)
                ?? (addrDict["county"] as? String)
                ?? (addrDict["state"] as? String)
"""

NEW = """            let rawName: String? = json["name"] as? String
            let nonEmptyName: String? = (rawName?.isEmpty ?? true) ? nil : rawName
            let nameCandidates: [String?] = [
                nonEmptyName,
                addrDict["road"] as? String,
                addrDict["neighbourhood"] as? String,
                addrDict["suburb"] as? String,
                addrDict["city"] as? String,
                addrDict["town"] as? String,
                addrDict["county"] as? String,
                addrDict["state"] as? String,
            ]
            let name: String? = nameCandidates.compactMap { $0 }.first
"""

src = open(PATH, encoding="utf-8").read()
count = src.count(OLD)
if count != 1:
    sys.exit(f"fix-typecheck: blocco atteso trovato {count} volte in {PATH} (atteso 1)")
open(PATH, "w", encoding="utf-8").write(src.replace(OLD, NEW))
print(f"fix-typecheck: applicato a {PATH}")
