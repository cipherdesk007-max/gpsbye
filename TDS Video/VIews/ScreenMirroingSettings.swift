//
//  ScreenMirroingSettings.swift
//  TDS Video
//
//  Created by Thomas Dye on 20/03/2025.
//

import SwiftUI

struct ScreenMirroingSettings: View {
    
    @ObservedObject var videoAPI = ScreenCaptureManager.shared
    @AppStorage("CarIsRightHanded") private var carIsRightHanded: Bool = false
    
    var body: some View {
        Form {
            Section(header: Label("Orientamento", systemImage: "rectangle.rotate")) {
                Picker("Orientamento specchiatura", selection: $videoAPI.selectedOrientation) {
                    ForEach(ScreenOrientation.allCases, id: \.self) { orientation in
                        Text(orientation.humanReadable())
                            .tag(orientation)
                    }
                }
                .pickerStyle(.menu)
            }

            Section(header: Label("Proporzioni", systemImage: "aspectratio")) {
                Picker("Proporzioni", selection: $videoAPI.selectedAspectRatio) {
                    ForEach(AspectRatio.allCases, id: \.self) { ratio in
                        Text(ratio.humanReadableName())
                            .tag(ratio)
                    }
                }
                .pickerStyle(.menu)

                Text("Scegli le proporzioni più adatte allo schermo della tua auto.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section(header: Label("Margine dello schermo", systemImage: "arrow.left.and.right")) {
                Picker("Lato del margine", selection: Binding(
                    get: { OffsetOption.from(offset: videoAPI.Screenoffset) },
                    set: {
                        videoAPI.Screenoffset = $0.offset
                        ScreenCaptureManager.shared.CarPlaysideofcarchange?($0.offset)
                    }
                )) {
                    ForEach(OffsetOption.allCases) { option in
                        Text(option.displayName)
                            .tag(option)
                    }
                }
                .pickerStyle(.menu)

                Text("Margine attuale: \(videoAPI.Screenoffset.rawValue)")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

//            Section(header: Label("Configurazione auto", systemImage: "car")) {
//                Toggle("Guida a destra", isOn: $carIsRightHanded)
//                
//                Text("Attivalo se il volante della tua auto è a destra: adatta la disposizione dello schermo e dei comandi.")
//                    .font(.caption2)
//                    .foregroundColor(.secondary)
//            }
        }
        .navigationTitle("Impostazioni specchiatura")
    }
}
