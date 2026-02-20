import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";

function resolveModulesDir() {
    const envModulesPath = process.env.FOUNDRY_MODULES_PATH;
    if (envModulesPath) return envModulesPath;

    const envDataPath = process.env.FOUNDRY_DATA_PATH;
    if (envDataPath) {
        const normalized = path.normalize(envDataPath);
        const baseName = path.basename(normalized).toLowerCase();
        if (baseName === "modules") return normalized;
        if (baseName === "data") return path.join(normalized, "modules");
        return path.join(normalized, "Data", "modules");
    }

    const localAppData = process.env.LOCALAPPDATA;
    const roamingAppData = process.env.APPDATA;
    const candidates = [
        localAppData && path.join(localAppData, "FoundryVTT", "Data", "modules"),
        roamingAppData && path.join(roamingAppData, "FoundryVTT", "Data", "modules"),
        localAppData &&
            path.join(localAppData, "Foundry Virtual Tabletop", "Data", "modules"),
        roamingAppData &&
            path.join(roamingAppData, "Foundry Virtual Tabletop", "Data", "modules"),
    ].filter(Boolean);

    const existingCandidate = candidates.find((candidate) => existsSync(candidate));
    if (existingCandidate) return existingCandidate;

    if (localAppData) return path.join(localAppData, "FoundryVTT", "Data", "modules");
    if (roamingAppData) return path.join(roamingAppData, "FoundryVTT", "Data", "modules");

    throw new Error(
        "Could not resolve Foundry modules path. Set FOUNDRY_MODULES_PATH."
    );
}

function resolveBuildDir(repoRoot) {
    const distDir = path.join(repoRoot, "dist");
    if (existsSync(path.join(distDir, "module.json"))) return distDir;
    if (existsSync(path.join(repoRoot, "module.json"))) return repoRoot;
    throw new Error("module.json was not found in dist/ or the repo root.");
}

const repoRoot = process.cwd();
const buildDir = resolveBuildDir(repoRoot);
const moduleJsonPath = path.join(buildDir, "module.json");
const moduleJson = JSON.parse(readFileSync(moduleJsonPath, "utf8"));

if (!moduleJson.id || typeof moduleJson.id !== "string") {
    throw new Error(`module.json at ${moduleJsonPath} is missing a valid id.`);
}

const modulesDir = resolveModulesDir();
const destination = path.join(modulesDir, moduleJson.id);

mkdirSync(modulesDir, { recursive: true });
try {
    rmSync(destination, { recursive: true, force: true });
} catch (error) {
    if (error && (error.code === "EBUSY" || error.code === "EPERM")) {
        throw new Error(
            `Cannot replace ${destination} because files are locked. Close Foundry VTT and rerun deploy.`
        );
    }
    throw error;
}
cpSync(buildDir, destination, { recursive: true });

const deployedModuleJsonPath = path.join(destination, "module.json");
if (existsSync(deployedModuleJsonPath)) {
    const deployed = JSON.parse(readFileSync(deployedModuleJsonPath, "utf8"));
    if (deployed.protected) {
        delete deployed.protected;
        writeFileSync(
            deployedModuleJsonPath,
            `${JSON.stringify(deployed, null, 2)}\n`,
            "utf8"
        );
    }
}

const signaturePath = path.join(destination, "signature.json");
rmSync(signaturePath, { force: true });

console.log(`Deployed ${moduleJson.id}`);
console.log(`Source: ${buildDir}`);
console.log(`Destination: ${destination}`);
