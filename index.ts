#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {
	ArrowFunction,
	Block,
	FunctionDeclaration,
	FunctionExpression,
	Node,
	Project,
	SyntaxKind,
} from "ts-morph";

async function analyzeFunctions(folderToAnalyze: string) {
	const project = new Project({
		// Optionally add compiler options if needed, e.g., for JSX support analysis
		compilerOptions: {
			jsx: 2, // ts.JsxEmit.React // Use appropriate JSX setting if needed
		},
	});

	// Add source files from the target directory, excluding node_modules and dist
	const includePattern = path
		.join(folderToAnalyze, "**/*.{ts,tsx}")
		.replace(/\\/g, "/");
	const excludeNodeModulesPattern = "!**/node_modules/**"; // Simpler exclusion
	const excludeDistPattern = "!**/dist/**"; // Simpler exclusion

	project.addSourceFilesAtPaths([
		includePattern,
		excludeNodeModulesPattern,
		excludeDistPattern,
	]);

	let jsxFunctionCount = 0;
	let normalFunctionCount = 0;

	const sourceFiles = project.getSourceFiles();

	console.log(`Analyzing ${sourceFiles.length} files in ${folderToAnalyze}...`);

	for (const sourceFile of sourceFiles) {
		console.log(`Processing file: ${sourceFile.getFilePath()}`);
		sourceFile.forEachDescendant((node, traversal) => {
			if (
				Node.isFunctionDeclaration(node) ||
				Node.isArrowFunction(node) ||
				Node.isFunctionExpression(node)
			) {
				let returnsJsx = false;

				// Check 1: Look for JSX elements directly within the function body
				// This is a simple heuristic and might not cover all cases perfectly
				const body = node.getBody();
				if (body) {
					body.forEachDescendant((descendant) => {
						if (
							Node.isJsxElement(descendant) ||
							Node.isJsxSelfClosingElement(descendant) ||
							Node.isJsxFragment(descendant)
						) {
							returnsJsx = true;
							// No need to check further descendants of this function
							traversal.skip(); // We could skip here, but let's check return statements too for robustness
						}
					});
				}

				// Check 2: Specifically check return statements
				// FunctionDeclarations and FunctionExpressions have a body, ArrowFunctions might have a concise body
				if (
					Node.isFunctionDeclaration(node) ||
					Node.isFunctionExpression(node)
				) {
					const blockBody = node.getBody();
					if (blockBody && Node.isBlock(blockBody)) {
						for (const statement of blockBody.getStatements()) {
							if (Node.isReturnStatement(statement)) {
								const expression = statement.getExpression();
								if (
									expression &&
									(Node.isJsxElement(expression) ||
										Node.isJsxSelfClosingElement(expression) ||
										Node.isJsxFragment(expression))
								) {
									returnsJsx = true;
								}
							}
						}
					}
				} else if (Node.isArrowFunction(node)) {
					const arrowBody = node.getBody();
					// Handle concise body: () => <div />
					if (
						Node.isJsxElement(arrowBody) ||
						Node.isJsxSelfClosingElement(arrowBody) ||
						Node.isJsxFragment(arrowBody)
					) {
						returnsJsx = true;
					}
					// Handle block body: () => { return <div />; }
					else if (Node.isBlock(arrowBody)) {
						for (const statement of arrowBody.getStatements()) {
							if (Node.isReturnStatement(statement)) {
								const expression = statement.getExpression();
								if (
									expression &&
									(Node.isJsxElement(expression) ||
										Node.isJsxSelfClosingElement(expression) ||
										Node.isJsxFragment(expression))
								) {
									returnsJsx = true;
								}
							}
						}
					}
				}

				if (returnsJsx) {
					jsxFunctionCount++;
					// console.log(`Found JSX function: ${node.getSymbol()?.getName() || '[Anonymous]'}`);
				} else {
					normalFunctionCount++;
					// console.log(`Found normal function: ${node.getSymbol()?.getName() || '[Anonymous]'}`);
				}

				// Important: Skip the children of this function node to avoid counting nested functions separately
				// if they are already accounted for by the outer function check.
				// However, our current logic counts *all* function definitions it finds.
				// traversal.skip(); // Uncomment if you only want to count top-level functions within the file scope.
			}
		});
	}

	console.log("\n--- Analysis Complete ---");
	console.log(`Total Files Analyzed: ${sourceFiles.length}`);
	console.log(`Functions returning JSX (heuristic): ${jsxFunctionCount}`);
	console.log(`Other functions: ${normalFunctionCount}`);
	console.log(
		`Total functions found: ${jsxFunctionCount + normalFunctionCount}`,
	);
}

// Get target folder from command-line arguments
const targetFolderArg = process.argv[2];

if (!targetFolderArg) {
	console.error(
		"Error: Please provide the target folder path as a command-line argument.",
	);
	console.error("Usage: ts-node index.ts <path-to-folder>");
	process.exit(1);
}

// Resolve the path to ensure it's absolute and normalized
const targetFolder = path.resolve(targetFolderArg);

// Check if the resolved path exists and is a directory
if (!fs.existsSync(targetFolder) || !fs.statSync(targetFolder).isDirectory()) {
	console.error(
		`Error: The provided path "${targetFolder}" does not exist or is not a directory.`,
	);
	process.exit(1);
}
// Pass the validated target folder path to the function
analyzeFunctions(targetFolder).catch((error) => {
	console.error("An error occurred during analysis:", error);
	process.exit(1); // Exit with error code on analysis failure
});
