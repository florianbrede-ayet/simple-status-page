import React, { useEffect } from "react";

interface SvgFaviconProps {
	svgMarkup: string;
}

const SvgFavicon: React.FC<SvgFaviconProps> = ({ svgMarkup }) => {
	useEffect(() => {
		const svgToDataURL = (svg: string): string => {
			return `data:image/svg+xml,${encodeURIComponent(svg)}`;
		};

		const setFavicon = (svgDataUrl: string): void => {
			let link: HTMLLinkElement =
				document.querySelector("link[rel*='icon']") || document.createElement("link");
			link.type = "image/svg+xml";
			link.rel = "shortcut icon";
			link.href = svgDataUrl;
			document.head.appendChild(link);
		};

		const dataUrl: string = svgToDataURL(svgMarkup);
		setFavicon(dataUrl);

		return () => {
			const link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
			if (link) {
				document.head.removeChild(link);
			}
		};
	}, [svgMarkup]);

	return null; // this component does not render anything
};

export default SvgFavicon;
