import { useRef, useEffect, useState } from "react";
import "../css/dashboard.css";
import CourseDisplay from "./courseDisplay.jsx";
import AboutPDM from "./about.jsx";
import { useNavigate } from "react-router-dom";
import Objectives from "./objectives.jsx";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger, ScrollSmoother } from "gsap/all";
import gsap from "gsap";

gsap.registerPlugin(ScrollSmoother, ScrollTrigger);


function Dashboard({ goChat, goAccounts, goLogin }) {
  //* ============= ENV API'S =============
  const EXPRESS_API = import.meta.env.VITE_EXPRESS_API;
  const PYTHON_API = import.meta.env.VITE_PYTHON_API;
  //* =============== REFS ===============
  const [studentData, setStudentData] = useState(null);
  const smootherRef = useRef(null);
  //* ============== STATE ===============
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(true);
  const [scrollPage, setScrollPage] = useState("home");
  //* ======== NAVIGATION HANDLER ========
  const navigate = useNavigate();

  //! ++++++++++++++++++++++ FUNCTIONS +++++++++++++++++++++
  useEffect(() => {
    //* ==================================
    //? TEMP LOG-IN DATA
    //* =================================
    const loggedInData = () => {
      fetch(`${EXPRESS_API}/student/${localStorage.getItem("studentId")}`)
        .then((res) => res.json())
        .then((data) => {
          console.log(data);
          if (data.role == "Guest") {
            setGuest(true);
          } else {
            setGuest(false);
          }
          console.log("Guest Mode:", guest);
          //! Temporarily stores log in data for reusability
          setStudentData(data);
        })
        .catch((err) => console.error("Fetch error:", err));
    };

    //* ==================================
    //? CHECK SERVER HEALTH
    //* ==================================
    const checkServer = async () => {
      try {
        const res = await fetch(`${EXPRESS_API}/health`);
        if (res.ok) {
          //! Set loading state to false once server responds
          setLoading(false);
          loggedInData();
        } else {
          setTimeout(checkServer, 200);
        }
      } catch {
        setTimeout(checkServer, 200);
      }
    };
    
    checkServer();
  }, [location.pathname, guest]);

  useEffect(() => {
    if (!scrollPage) return;

    const target = document.getElementById(scrollPage);
    if (!target) return;

    const offset = 150;
    const elementPosition = target.getBoundingClientRect().top + window.scrollY;
    const offsetPosition = elementPosition - offset;

    const start = window.scrollY;
    const distance = offsetPosition - start;
    const duration = 500;
    let startTime = null;

    function animation(currentTime) {
      if (startTime === null) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);

      window.scrollTo(0, start + distance * progress);

      if (timeElapsed < duration) requestAnimationFrame(animation);
    }

    requestAnimationFrame(animation);
    setScrollPage("");
  }, [scrollPage]);

  const buttons = [
    {
      id: 0,
      title: "Creating Account",
      subtitle: "Register and Login Your Account",
      defaultImg: "/dashboardBtn/btn1Act.svg",
      activeImg: "/dashboardBtn/btn1Una.svg",
    },
    {
      id: 1,
      title: "Using the System",
      subtitle: "Utilizig Smart System for your needs",
      defaultImg: "/dashboardBtn/btn2Act.svg",
      activeImg: "/dashboardBtn/btn2Una.svg",
    },
    {
      id: 2,
      title: "Navigating the App",
      subtitle: "Going through each features",
      defaultImg: "/dashboardBtn/btn3Act.svg",
      activeImg: "/dashboardBtn/btn3Una.svg",
    },
  ];

  const handleLogout = () => {
    localStorage.removeItem("studentId"); //* clear saved session
    goLogin(); //* go back to Login page
  };

  useGSAP(() => {
    if (loading) return;

    //* ✅ Create ScrollSmoother if not exists
    if (!smootherRef.current) {
      smootherRef.current = ScrollSmoother.create({
        wrapper: "#smooth-wrapper",
        content: "#smooth-content",
        smooth: 2,
        effects: true,
      });
    }

    //* ✅ GSAP Animations
    gsap.from(".navigation-bar", { y: -50, duration: 0.7, ease: "circ" });
    gsap.from(".hero-text", {
      yPercent: 130,
      duration: 1,
      stagger: 0,
      ease: "circ",
    });

    gsap.from(".course-text", {
      x: -1000,
      duration: 1,
      stagger: 0.5,
      scrollTrigger: {
        trigger: ".course-text",
        start: "top 100%",
      },
    });

    gsap.from(".feature-text", {
      x: -1000,
      duration: 1.5,
      stagger: 0.2,
      ease: "circ.Out",
      scrollTrigger: {
        trigger: ".main-image",
        start: "top 100%",
      },
    });

    //* ✅ Refresh after animation + smoother init
    ScrollTrigger.refresh();

    return () => {
      //* ✅ Kill ScrollTrigger animations
      ScrollTrigger.getAll().forEach((t) => t.kill());
      gsap.killTweensOf(
        ".navigation-bar, .hero-text, .course-text, .feature-text"
      );

      //* ✅ Destroy smoother so it can rebuild
      if (smootherRef.current) {
        smootherRef.current.kill();
        smootherRef.current = null;
      }
    };
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    const smoother = ScrollSmoother.create({
      wrapper: "#smooth-wrapper",
      content: "#smooth-content",
      smooth: 5,
      effects: true,
    });
  }, [loading]);
  return (
    <>
      {loading && (
        <div className="absolute flex-col gap-5 w-full h-full z-50 flex items-center justify-center bg-amber-900/10 backdrop-blur-2xl">
          <span className="loader"></span>
          <span className="loaderBar"></span>
        </div>
      )}
      {!loading && (
        <div id="smooth-wrapper" className="flex flex-col bg-[rgb(51,13,3)">
          {/* Navigation Bar */}
          <div className="navigation-bar text-white px-[1rem] py-[0.5rem] justify-between w-full h-fit flex flex-row bg-[#792C1A] backdrop-blur-sm items-center fixed border-b-2 border-amber-400 z-10">
            <div className="flex items-center gap-1">
              <img
                src="./images/PDM-Logo.svg"
                alt="PDM Logo"
                className="w-[5%]"
              />
              <h1 className="typo-subheader-semibold">
                <span className="text-amber-300">Information</span>System
              </h1>
            </div>
            <div className="flex items-center gap-5 typo-buttons-semibold">
              <a
                href="#home"
                onClick={(e) => {
                  e.preventDefault();
                  setScrollPage("home");
                }}
              >
                {" "}
                Home{" "}
              </a>
              <a
                href="#Courses"
                onClick={(e) => {
                  e.preventDefault();
                  setScrollPage("courses");
                }}
              >
                {" "}
                Courses{" "}
              </a>
              <a
                href="#About"
                onClick={(e) => {
                  e.preventDefault();
                  setScrollPage("about");
                }}
              >
                {" "}
                About PDM{" "}
              </a>
              <button
                onClick={() => {
                  if (guest) {
                    navigate("/login");
                  } else {
                    localStorage.setItem("studentId", "PDM-0000-000000");
                    localStorage.setItem("role", "Guest");
                    setGuest(true);
                    navigate("/");
                  }
                }}
                className="bg-amber-400 py-[0.5rem] px-[1.4rem] text-white font-semibold rounded-sm shadow-amber-950/50 shadow-md cursor-pointer hover:scale-105 duration-300"
              >
                {guest ? "Log In" : "Log Out"}
              </button>
            </div>
          </div>

          <div id="smooth-content">
            {/* Hero Section */}
            <div
              id="home"
              className="flex w-full h-[100vh] pt-[5%] bg-[linear-gradient(to_bottom,rgba(121,44,26,0.8),rgba(51,13,3,1)),url('/images/PDM-Facade.png')] bg-cover bg-center bg-no-repeat"
            >
              <div className="flex flex-col gap-[5%] h-full items-center justify-center w-full pb-[10vw]">
                <div className="flex flex-col items-center">
                  <div className="overflow-clip pb-[1%]">
                    <h1 className="hero-text text-yellow-400 text-center text-[clamp(2.5rem,6vw,9rem)] font-medium font-serif leading-[100%]">
                      Learning Made Smarter
                    </h1>
                  </div>
                  <div className="overflow-clip">
                    <h2 className="hero-text text-white text-[clamp(0.7rem,1.8vw,5rem)] font-medium ">
                      Pambayang Dalubhasaan ng Marilao
                    </h2>
                  </div>
                </div>
                <div className="flex gap-7 w-full justify-center">
                  <button
                    onClick={() => {
                      navigate("/chatPrompt");
                    }}
                    className="text-amber-950 cursor-pointer w-[12vw] py-[0.5rem] font-bold text-[clamp(0.5rem,1.3vw,2rem)] rounded-md bg-amber-400 shadow-md shadow-black hover:scale-105 transition-all duration-300"
                  >
                    Try AI
                  </button>
                </div>
              </div>
            </div>
            <div className="w-full flex flex-col gap-5 bg-[rgb(51,13,3)] h-fit p-[2vw]">
              <div className="flex flex-col p-[1vw] border-l-5 overflow-hidden border-amber-400 text-white">
                <h1 className="course-text typo-header-semibold">
                  Offereded Programs
                </h1>
                <h2 className="course-text typo-content-semibold">
                  Explore our most popular courses designed by industry experts
                </h2>
              </div>
              <div id="courses">
                <CourseDisplay />
              </div>
            </div>

            {/* Mission and Vission */}
            <div
              id="about"
              className="w-full flex flex-row justify-between gap-[3vw] p-[2vw]"
            >
              <div className="main-image flex flex-col w-[55%] rounded-md aspect-[1] p-[4vw] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.8),rgba(0,0,0,0.3)),url(./images/mainSection.jpg)] bg-left bg-no-repeat bg-cover">
                <div className="flex flex-col w-[80%] h-fit overflow-hidden">
                  <h1 className="feature-text typo-header-semibold text-amber-500">
                    Information System
                  </h1>
                  <h2 className="feature-text typo-content-regular text-white text-justify">
                    This Localized AI Information System is designed to make
                    school processes smarter, faster, and easier. With
                    intelligent guidance, real-time assistance, and a
                    user-friendly interface, everyone can quickly access
                    information, explore system features, and get support
                    whenever they need it — all in just a ew clicks.
                  </h2>
                </div>
              </div>

              <div className="w-[45%] flex flex-col gap-[3vw]">
                <div className="flex flex-col w-full p-[4vw] rounded-md aspect-square bg-[linear-gradient(to_bottom,rgba(0,0,0,0.8),rgba(0,0,0,0.3)),url(./images/mission.jpg)] bg-center bg-no-repeat bg-cover">
                  <div className="flex flex-col w-[100%] h-fit overflow-hidden">
                    <h1 className="feature-text typo-header-semibold text-amber-500">
                      Mission
                    </h1>
                    <h2 className="feature-text typo-content-regular text-white text-justify">
                      Cognizant of the importance of contributing to the
                      realization of national development goals and right of
                      every citizen to quality education, PDM commit itself to
                      the provision of quality education, and mold its students
                      into productive and responsible citizens who are imbued
                      with virtues, aware of their national heritage and proud
                      of their local culture.
                    </h2>
                  </div>
                </div>

                <div className="flex flex-col w-full p-[4vw] rounded-md aspect-square bg-[linear-gradient(to_bottom,rgba(0,0,0,0.8),rgba(0,0,0,0.3)),url(./images/vision.jpg)] bg-no-repeat bg-cover">
                  <div className="flex flex-col w-[100%] h-fit overflow-hidden">
                    <h1 className="feature-text typo-header-semibold text-amber-500">
                      Vision
                    </h1>
                    <h2 className="feature-text typo-content-regular text-white text-justify">
                      The Pambayang Dalubhasaan ng Marilao (PDM), one of the
                      premier higher educational institutions in the region in
                      providing quality subsidized tertiary education and
                      industry training programs committed to produce competent,
                      competitive, capable, and skillful graduates who excel in
                      their chosen field.
                    </h2>
                  </div>
                </div>
              </div>
            </div>
            <div
              id="objectives"
              className="w-full p-[3vw] flex justify-center bg-amber-500"
            >
              <Objectives></Objectives>
            </div>
            <div className="w-full flex justify-center">
              <AboutPDM></AboutPDM>
            </div>
          </div>

          {/* <div
            id="courses"
            className=" flex flex-row items-center justify-center shadow-lg shadow-gray-400 bg-amber-500 w-full h-90 z-1"
          >
            <div className="w-[80%] h-[110%] shadow-lg shadow-gray-700 bg-amber-900">
              <CourseDisplay />
            </div>
          </div>

          <div id="about" className="w-full h-[100vh] bg-white">
            <AboutPDM></AboutPDM>
          </div> */}
        </div>
      )}
    </>
  );
}

export default Dashboard;
