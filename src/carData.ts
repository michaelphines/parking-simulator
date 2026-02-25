export interface CarSpec {
  name: string;
  lengthInches: number;
  widthInches: number;
  wheelbaseInches: number;
  turningCircleFeet: number; // curb-to-curb turning diameter
  color: string;
}

// All specs from manufacturer data / Edmunds / carsguide 2024-2025 models
export const CAR_DATABASE: CarSpec[] = [
  {
    name: "MINI Cooper",
    lengthInches: 152.7,
    widthInches: 68.7,
    wheelbaseInches: 98.2,
    turningCircleFeet: 35.4,
    color: "#E74C3C",
  },
  {
    name: "Toyota Corolla",
    lengthInches: 182.3,
    widthInches: 70.1,
    wheelbaseInches: 106.3,
    turningCircleFeet: 34.8,
    color: "#3498DB",
  },
  {
    name: "Toyota Camry",
    lengthInches: 193.5,
    widthInches: 72.4,
    wheelbaseInches: 111.2,
    turningCircleFeet: 38.1,
    color: "#2ECC71",
  },
  {
    name: "Honda CR-V",
    lengthInches: 184.8,
    widthInches: 73.0,
    wheelbaseInches: 106.3,
    turningCircleFeet: 37.3,
    color: "#9B59B6",
  },
  {
    name: "Jeep Gladiator",
    lengthInches: 218.0,
    widthInches: 73.8,
    wheelbaseInches: 137.3,
    turningCircleFeet: 44.5,
    color: "#F39C12",
  },
  {
    name: "Ford F-150 (SuperCrew)",
    lengthInches: 232.0,
    widthInches: 80.0,
    wheelbaseInches: 145.4,
    turningCircleFeet: 47.8,
    color: "#1ABC9C",
  },
];
