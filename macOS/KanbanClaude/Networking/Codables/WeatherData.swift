import Foundation

// External Open-Meteo response (NOT server-mediated).
struct WeatherData: Codable, Hashable, Sendable {
    struct Current: Codable, Hashable, Sendable {
        let temp: Double
        let code: Int
        let humidity: Double
        let wind: Double
    }
    struct Day: Codable, Hashable, Sendable {
        let date: String
        let code: Int
        let max: Double
        let min: Double
    }
    let current: Current
    let daily: [Day]
}
